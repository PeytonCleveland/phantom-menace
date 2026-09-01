import { passkey } from "@better-auth/passkey";
import type { Database } from "@lighthouse/db";
import { schema } from "@lighthouse/db";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { emailOTP } from "better-auth/plugins/email-otp";
import { type EmailDomainPolicy, loadEmailDomainPolicy } from "./domain-policy";
import { type EmailSender, loadEmailSender } from "./email";
import { isSessionAllowed, provisionLearnerProfile } from "./gates";

export {
  DEFAULT_ALLOWED_EMAIL_DOMAINS,
  EmailDomainPolicy,
  loadEmailDomainPolicy,
} from "./domain-policy";
export {
  createConsoleEmailSender,
  createSesEmailSender,
  type EmailSender,
  loadEmailSender,
} from "./email";
export { isSessionAllowed, provisionLearnerProfile } from "./gates";

/** OTP lifetime in seconds. */
const OTP_EXPIRES_IN_SECONDS = 300;

/** Endpoints that accept an email address and must be domain-gated. */
const EMAIL_GATED_PATHS = new Set(["/email-otp/send-verification-otp", "/sign-in/email-otp"]);

export interface CreateAuthOptions {
  /** Drizzle database instance from @lighthouse/db `createDb`. */
  db: Database;
  /** Base URL the auth server is mounted on, e.g. http://localhost:3000. */
  baseURL?: string;
  /** Secret for signing/encryption. Falls back to BETTER_AUTH_SECRET. */
  secret?: string;
  /** Origins allowed to make authenticated requests. */
  trustedOrigins?: string[];
  /** Email domain allowlist. Defaults to the configured/built-in policy. */
  domainPolicy?: EmailDomainPolicy;
  /** OTP email transport. Defaults to SES when configured, console otherwise. */
  emailSender?: EmailSender;
  /** WebAuthn relying-party configuration for passkeys. */
  passkey?: {
    rpID?: string;
    rpName?: string;
    origin?: string;
  };
}

/**
 * Lighthouse Better Auth instance.
 *
 * Authentication model:
 * - Email OTP is the entry point. Sign-up and sign-in are the same flow;
 *   the domain allowlist is what restricts membership.
 * - Passkeys are added *after* an OTP sign-in (`requireSession` stays at its
 *   default `true`), so a Team Bespin email is always proven before a
 *   credential is bound to an account.
 *
 * Domain enforcement runs at three independent gates, because no single hook
 * covers every path:
 *
 *   Gate 1  `hooks.before` on the email endpoints — rejects before an OTP is
 *           generated or mailed.
 *   Gate 2  `user.validateUserInfo` — authoritative check at provisioning.
 *   Gate 3  `databaseHooks.session.create.before` — re-checked on *every*
 *           session creation. This is the only gate on the passkey sign-in
 *           path, which never sends an email or creates a user, and it is
 *           what revokes access when an account falls outside the allowlist.
 */
export function createAuth(options: CreateAuthOptions) {
  const { db } = options;
  const domainPolicy = options.domainPolicy ?? loadEmailDomainPolicy();
  const emailSender = options.emailSender ?? loadEmailSender();

  const rpID = options.passkey?.rpID ?? process.env.PASSKEY_RP_ID;
  const rpName = options.passkey?.rpName ?? process.env.PASSKEY_RP_NAME ?? "Lighthouse";
  const passkeyOrigin = options.passkey?.origin ?? process.env.PASSKEY_ORIGIN;

  return betterAuth({
    baseURL: options.baseURL,
    secret: options.secret,
    trustedOrigins: options.trustedOrigins,

    database: drizzleAdapter(db, {
      provider: "pg",
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
        passkey: schema.passkey,
        rateLimit: schema.rateLimit,
      },
    }),

    // Passwords are not an authentication method in Lighthouse.
    emailAndPassword: { enabled: false },

    rateLimit: {
      // `enabled` is left to Better Auth's default (production only) so local
      // development and tests are not throttled.
      //
      // Storage is moved off the in-memory default: memory counters are
      // per-process, so a multi-instance deployment would let an attacker
      // spread OTP requests across instances to multiply the effective limit,
      // and counters would reset on every deploy.
      storage: "database",
    },

    session: {
      expiresIn: 60 * 60 * 24 * 7, // 7 days
      updateAge: 60 * 60 * 24, // refresh at most daily
    },

    plugins: [
      emailOTP({
        otpLength: 6,
        expiresIn: OTP_EXPIRES_IN_SECONDS,
        allowedAttempts: 3,
        // Default is "plain", which persists a login-capable secret in
        // cleartext. Hash it so a database read cannot be replayed as a login.
        storeOTP: "hashed",
        // Sign-up and sign-in are one flow; the domain gates decide membership.
        disableSignUp: false,
        // OTP verification proves control of the address, so it also serves
        // as email verification.
        overrideDefaultEmailVerification: true,
        rateLimit: { window: 60, max: 3 },

        async sendVerificationOTP({ email, otp, type }) {
          // Gate 1 (belt and braces): the `hooks.before` middleware already
          // rejected disallowed domains before the OTP was generated. This
          // second check protects against the path matcher drifting.
          if (!domainPolicy.isAllowed(email)) {
            throw new APIError("FORBIDDEN", { message: domainPolicy.rejectionMessage() });
          }

          await emailSender.sendOtp({
            to: email,
            otp,
            type,
            expiresInMinutes: Math.round(OTP_EXPIRES_IN_SECONDS / 60),
          });
        },
      }),

      passkey({
        ...(rpID ? { rpID } : {}),
        rpName,
        ...(passkeyOrigin ? { origin: passkeyOrigin } : {}),
        authenticatorSelection: {
          residentKey: "preferred",
          // Require a biometric or PIN gesture, not merely credential presence.
          userVerification: "required",
        },
      }),
    ],

    hooks: {
      // ── Gate 1 ────────────────────────────────────────────────────────────
      // Reject disallowed domains before the plugin generates or stores an OTP.
      before: createAuthMiddleware(async (ctx) => {
        if (!EMAIL_GATED_PATHS.has(ctx.path)) return;

        const email = (ctx.body as { email?: unknown } | undefined)?.email;
        if (typeof email !== "string" || !domainPolicy.isAllowed(email)) {
          throw new APIError("FORBIDDEN", { message: domainPolicy.rejectionMessage() });
        }
      }),
    },

    user: {
      // ── Gate 2 ────────────────────────────────────────────────────────────
      // Authoritative provisioning check, across every method and action.
      validateUserInfo: async ({ user }) => {
        if (typeof user.email !== "string" || !domainPolicy.isAllowed(user.email)) {
          return {
            error: "email_domain_not_allowed",
            errorDescription: domainPolicy.rejectionMessage(),
          };
        }
      },
    },

    databaseHooks: {
      user: {
        create: {
          // Provision the Lighthouse learner identity alongside the auth user
          // so evidence, assertions, and role state have somewhere to land.
          // Idempotent: a retried sign-up must not fail on a duplicate.
          after: async (createdUser) => {
            await provisionLearnerProfile(db, createdUser);
          },
        },
      },

      session: {
        create: {
          // ── Gate 3 ──────────────────────────────────────────────────────
          // Re-validate the owning account's domain on every session
          // creation. Covers passkey sign-in (which sends no email and
          // creates no user) and revokes access for accounts that have
          // fallen outside the allowlist.
          before: async (session) => {
            if (!(await isSessionAllowed(db, domainPolicy, session.userId))) {
              return false;
            }
          },
        },
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
export type Session = Auth["$Infer"]["Session"];
