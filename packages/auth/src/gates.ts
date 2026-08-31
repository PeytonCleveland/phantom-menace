import type { Database } from "@lighthouse/db";
import { schema } from "@lighthouse/db";
import { eq } from "drizzle-orm";
import type { EmailDomainPolicy } from "./domain-policy";

/**
 * Shared domain-gate logic, extracted from the Better Auth option closures so
 * it can be tested directly. Gate 3 in particular guards the passkey sign-in
 * path, which cannot be exercised without a full WebAuthn ceremony — keeping
 * the decision in a plain function means the rule itself stays under test.
 */

/**
 * Gate 3: is the account behind this session still inside the allowlist?
 *
 * Called on every session creation, including passkey sign-in (which sends no
 * email and creates no user). Returns false for unknown users, so a session
 * can never be minted for an account that no longer exists.
 */
export async function isSessionAllowed(
  db: Database,
  domainPolicy: EmailDomainPolicy,
  userId: string,
): Promise<boolean> {
  const rows = await db
    .select({ email: schema.user.email })
    .from(schema.user)
    .where(eq(schema.user.id, userId))
    .limit(1);

  const email = rows[0]?.email;
  if (typeof email !== "string") return false;
  return domainPolicy.isAllowed(email);
}

/**
 * Provision the Lighthouse learner identity for a newly created auth user.
 * Idempotent so a retried sign-up cannot fail on a duplicate.
 */
export async function provisionLearnerProfile(
  db: Database,
  user: { id: string; email: string; name?: string | null },
): Promise<void> {
  await db
    .insert(schema.profile)
    .values({
      externalSubjectId: user.id,
      displayName: user.name || user.email,
      metadata: { provisionedFrom: "auth", email: user.email },
    })
    .onConflictDoNothing({ target: schema.profile.externalSubjectId });
}
