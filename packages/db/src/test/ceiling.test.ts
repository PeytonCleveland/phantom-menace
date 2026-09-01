import { sql } from "drizzle-orm";
import { afterAll, expect, test } from "vitest";
import * as s from "../schema/index";
import { recordObservation } from "../services/evidence";
import { createLearner, objectiveId, withDb } from "./helpers";

const { db, pool } = withDb();
afterAll(async () => {
  await pool.end();
});

test("an L2-ceiling administration cannot establish an L3 objective", async () => {
  const learnerId = await createLearner(db, "ceiling-guard");

  const administration = await db.execute(sql`
    SELECT ta.id FROM assessment.task_administration ta
    WHERE ta.mode = 'practice' AND ta.effective_evidence_ceiling = 2
    LIMIT 1
  `);
  const administrationId = administration.rows[0]?.id;
  if (typeof administrationId !== "string") throw new Error("no L2 practice administration seeded");

  const [attempt] = await db
    .insert(s.learnerAttempt)
    .values({ learnerId, taskAdministrationId: administrationId, attemptStatus: "completed" })
    .returning({ id: s.learnerAttempt.id });
  if (!attempt) throw new Error("failed to create attempt");

  await expect(
    recordObservation(db, {
      learnerId,
      attemptId: attempt.id,
      objectiveRevisionId: await objectiveId(db, "RUST-NET-L3-001"),
      result: "successful",
      evidenceStrength: "direct",
      independenceLevel: 3,
      transferDistance: "near",
      performanceScope: "focused",
    }),
  ).rejects.toThrow(/ceiling/i);
});
