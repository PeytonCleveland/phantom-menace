import type { Database } from "@lighthouse/db";
import { schema } from "@lighthouse/db";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

export interface CreateAuthOptions {
  /** Drizzle database instance from @lighthouse/db `createDb`. */
  db: Database;
  /** Base URL the auth server is mounted on, e.g. http://localhost:3000. */
  baseURL?: string;
  /** Secret for signing/encryption. Falls back to BETTER_AUTH_SECRET. */
  secret?: string;
  /** Origins allowed to make authenticated requests. */
  trustedOrigins?: string[];
}

/**
 * Factory for the Lighthouse Better Auth instance.
 *
 * The auth tables (user, session, account, verification) live in the `auth`
 * PostgreSQL schema and are managed by @lighthouse/db migrations, so the
 * whole database migrates through a single drizzle pipeline.
 */
export function createAuth(options: CreateAuthOptions) {
  const { db, baseURL, secret, trustedOrigins } = options;

  return betterAuth({
    baseURL,
    secret,
    trustedOrigins,
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
      },
    }),
    emailAndPassword: {
      enabled: true,
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
export type Session = Auth["$Infer"]["Session"];
