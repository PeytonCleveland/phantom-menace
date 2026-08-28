import { afterAll, expect, test } from "vitest";
import { objectiveId, releaseId, withDb } from "./helpers";

const { db, pool } = withDb();
afterAll(async () => {
  await pool.end();
});

test("the test database is migrated and seeded", async () => {
  await expect(releaseId(db)).resolves.toMatch(/^[0-9a-f-]{36}$/);
  await expect(objectiveId(db, "RUST-NET-L3-001")).resolves.toMatch(/^[0-9a-f-]{36}$/);
});
