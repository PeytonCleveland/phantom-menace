import { sql } from "drizzle-orm";
import { afterAll, expect, test } from "vitest";
import { canonicalContextKey } from "../services/context";
import { withDb } from "./helpers";

const { db, pool } = withDb();
afterAll(async () => {
  await pool.end();
});

test("canonical context keys sort by dimension and join with semicolons", () => {
  expect(canonicalContextKey({})).toBe("");
  expect(canonicalContextKey({ cloud_provider: "aws" })).toBe("cloud_provider=aws");
  expect(canonicalContextKey({ programming_language: "rust", cloud_provider: "aws" })).toBe(
    "cloud_provider=aws;programming_language=rust",
  );
});

test("the database canonicalization agrees with the TypeScript mirror", async () => {
  const cases: Array<Record<string, string>> = [
    {},
    { cloud_provider: "aws" },
    { programming_language: "rust", cloud_provider: "aws_govcloud" },
  ];
  for (const contexts of cases) {
    const result = await db.execute(
      sql`SELECT governance.canonical_context_key(${JSON.stringify(contexts)}::jsonb) AS key`,
    );
    expect(result.rows[0]?.key).toBe(canonicalContextKey(contexts));
  }
});
