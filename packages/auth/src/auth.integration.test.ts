import { type CreateDbResult, createDb, type Database, schema } from "@lighthouse/db";
import { eq, like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EmailDomainPolicy } from "./domain-policy";
import type { EmailSender, SendOtpParams } from "./email";
import { isSessionAllowed, provisionLearnerProfile } from "./gates";
import { createAuth } from "./index";

/**
 * Integration coverage for the three domain gates against a live PostgreSQL.
 * Requires the dev database (`pnpm db:up`).
 */

const CONNECTION =
  process.env.DATABASE_URL ?? "postgres://lighthouse:lighthouse@localhost:5432/lighthouse";

/** Captures OTPs instead of sending mail. */
function createRecordingSender(): EmailSender & { sent: SendOtpParams[] } {
  const sent: SendOtpParams[] = [];
  return {
    sent,
    async sendOtp(params) {
      sent.push(params);
    },
  };
}

const policy = new EmailDomainPolicy(["teambespin.us"]);

let db: Database;
let pool: CreateDbResult["pool"];
let sender: ReturnType<typeof createRecordingSender>;
let auth: ReturnType<typeof createAuth>;

const TEST_EMAIL = `vitest-${Date.now()}@teambespin.us`;

beforeAll(() => {
  ({ db, pool } = createDb(CONNECTION));
  sender = createRecordingSender();
  auth = createAuth({
    db,
    baseURL: "http://localhost:3000",
    secret: "integration-test-secret-integration-test-secret",
    domainPolicy: policy,
    emailSender: sender,
    passkey: { rpID: "localhost", rpName: "Lighthouse Test", origin: "http://localhost:3000" },
  });
});

afterAll(async () => {
  // Clean up rows this suite created.
  const users = await db
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(like(schema.user.email, "vitest-%@teambespin.us"));
  for (const user of users) {
    await db.delete(schema.session).where(eq(schema.session.userId, user.id));
    await db.delete(schema.account).where(eq(schema.account.userId, user.id));
    await db.delete(schema.profile).where(eq(schema.profile.externalSubjectId, user.id));
    await db.delete(schema.user).where(eq(schema.user.id, user.id));
  }
  await db.delete(schema.verification).where(like(schema.verification.identifier, "%vitest-%"));
  await pool.end();
});

describe("Gate 1 — OTP send is domain-gated", () => {
  /** Asserts the failure is specifically our domain gate, not an unrelated error. */
  async function expectDomainRejection(email: string): Promise<void> {
    const before = sender.sent.length;

    const error = await auth.api
      .sendVerificationOTP({ body: { email, type: "sign-in" } })
      .then(() => null)
      .catch((caught: unknown) => caught as { status?: string; message?: string });

    expect(error, `expected ${email} to be rejected`).not.toBeNull();
    expect(error?.status).toBe("FORBIDDEN");
    expect(error?.message).toContain("@teambespin.us");
    expect(sender.sent.length).toBe(before);
  }

  it("rejects a non-Bespin address and sends no email", async () => {
    await expectDomainRejection("attacker@gmail.com");
  });

  it("rejects a lookalike domain that merely ends with the allowed one", async () => {
    await expectDomainRejection("attacker@evil-teambespin.us");
  });

  it("rejects our domain used as a prefix of an attacker domain", async () => {
    await expectDomainRejection("attacker@teambespin.us.attacker.com");
  });

  it("rejects a subdomain of the allowed domain", async () => {
    await expectDomainRejection("user@dev.teambespin.us");
  });

  it("writes no verification row for a rejected address", async () => {
    await auth.api
      .sendVerificationOTP({ body: { email: "attacker@gmail.com", type: "sign-in" } })
      .catch(() => undefined);

    const rows = await db
      .select({ id: schema.verification.id })
      .from(schema.verification)
      .where(like(schema.verification.identifier, "%attacker@gmail.com%"));

    expect(rows).toHaveLength(0);
  });

  it("accepts a Bespin address and sends a 6-digit code", async () => {
    const result = await auth.api.sendVerificationOTP({
      body: { email: TEST_EMAIL, type: "sign-in" },
    });

    expect(result.success).toBe(true);
    const latest = sender.sent.at(-1);
    expect(latest?.to).toBe(TEST_EMAIL);
    expect(latest?.otp).toMatch(/^\d{6}$/);
  });
});

describe("Gate 2 + provisioning — sign-in creates user and learner profile", () => {
  it("signs in with the OTP, creating the user and its learner profile", async () => {
    await auth.api.sendVerificationOTP({ body: { email: TEST_EMAIL, type: "sign-in" } });
    const otp = sender.sent.at(-1)?.otp;
    expect(otp).toBeDefined();

    const result = await auth.api.signInEmailOTP({
      body: { email: TEST_EMAIL, otp: otp as string },
    });

    expect(result.user.email).toBe(TEST_EMAIL);

    // OTP verification proves control of the address.
    const [created] = await db
      .select({ id: schema.user.id, emailVerified: schema.user.emailVerified })
      .from(schema.user)
      .where(eq(schema.user.email, TEST_EMAIL));
    expect(created?.emailVerified).toBe(true);

    // Learner identity auto-provisioned and linked by external subject id.
    const [profile] = await db
      .select({ displayName: schema.profile.displayName })
      .from(schema.profile)
      .where(eq(schema.profile.externalSubjectId, created?.id as string));
    expect(profile).toBeDefined();
  });

  it("stores the OTP hashed, not in cleartext", async () => {
    await auth.api.sendVerificationOTP({ body: { email: TEST_EMAIL, type: "sign-in" } });
    const otp = sender.sent.at(-1)?.otp as string;

    const rows = await db
      .select({ value: schema.verification.value })
      .from(schema.verification)
      .where(like(schema.verification.identifier, `%${TEST_EMAIL}%`));

    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.value).not.toContain(otp);
    }
  });

  it("is idempotent when provisioning the same learner twice", async () => {
    const [user] = await db
      .select({ id: schema.user.id, email: schema.user.email, name: schema.user.name })
      .from(schema.user)
      .where(eq(schema.user.email, TEST_EMAIL));

    await expect(provisionLearnerProfile(db, user as never)).resolves.toBeUndefined();

    const profiles = await db
      .select({ id: schema.profile.id })
      .from(schema.profile)
      .where(eq(schema.profile.externalSubjectId, user?.id as string));
    expect(profiles).toHaveLength(1);
  });
});

describe("Gate 3 — session creation re-validates the account domain", () => {
  it("allows a session for an in-policy account", async () => {
    const [user] = await db
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(eq(schema.user.email, TEST_EMAIL));

    await expect(isSessionAllowed(db, policy, user?.id as string)).resolves.toBe(true);
  });

  it("blocks a session when the account falls outside the allowlist", async () => {
    // Simulates the passkey-bypass case: the credential still works, but the
    // account's domain is no longer admitted.
    const narrowed = new EmailDomainPolicy(["example.mil"]);
    const [user] = await db
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(eq(schema.user.email, TEST_EMAIL));

    await expect(isSessionAllowed(db, narrowed, user?.id as string)).resolves.toBe(false);
  });

  it("blocks a session for an unknown user id", async () => {
    await expect(
      isSessionAllowed(db, policy, "00000000-0000-0000-0000-000000000000"),
    ).resolves.toBe(false);
  });
});
