import { execFileSync } from "node:child_process";
import "dotenv/config";
import pg from "pg";

const ADMIN_URL =
  process.env.DATABASE_URL ?? "postgres://lighthouse:lighthouse@localhost:5432/lighthouse";
export const TEST_DATABASE_URL = ADMIN_URL.replace(/\/[^/]*$/, "/lighthouse_test");

export async function setup(): Promise<void> {
  const admin = new pg.Client({ connectionString: ADMIN_URL });
  await admin.connect();
  try {
    // Drop first: a leftover database from a failed run would be seeded twice,
    // and the seed refuses to run against an existing framework.
    await admin.query("DROP DATABASE IF EXISTS lighthouse_test WITH (FORCE)");
    await admin.query("CREATE DATABASE lighthouse_test");
  } finally {
    await admin.end();
  }

  const env = { ...process.env, DATABASE_URL: TEST_DATABASE_URL };
  // The seed calls main() at module scope, so it is executed, never imported.
  execFileSync("pnpm", ["exec", "drizzle-kit", "migrate"], { env, stdio: "inherit" });
  execFileSync("pnpm", ["exec", "tsx", "src/seed/index.ts"], { env, stdio: "inherit" });
}
