import { sql } from "drizzle-orm";
import { afterAll, expect, test } from "vitest";
import { propagateFromObservation, recordObservation } from "../services/evidence";
import { createLearner, objectiveId, withDb } from "./helpers";

const { db, pool } = withDb();
afterAll(async () => {
  await pool.end();
});

test("RUST-NET-L3-001 has structured criteria including a blocking critical error", async () => {
  const result = await db.execute(sql`
    SELECT c.code, c.kind
    FROM catalog.objective_criterion c
    JOIN catalog.learning_objective_revision lor ON lor.id = c.objective_revision_id
    JOIN catalog.learning_objective lo ON lo.id = lor.learning_objective_id
    WHERE lo.canonical_code = 'RUST-NET-L3-001'
    ORDER BY c.sort_order
  `);
  const codes = result.rows.map((r) => String(r.code));
  expect(codes).toContain("preserve-incomplete-data");
  expect(codes).toContain("no-data-loss");
  const criticalError = result.rows.find((r) => r.code === "no-data-loss");
  expect(criticalError?.kind).toBe("critical_error");
});

// Coverage is CRITERION-side, never observable-side. `direct` means
// claim-complete, so every criterion of the targeted objective must be
// reachable. An observable that maps to no criterion is perfectly fine —
// `framing-model` is context-setting and establishes nothing on its own.
test("every criterion of a direct spec's objective is reachable from an observable", async () => {
  const result = await db.execute(sql`
    SELECT lo.canonical_code, c.code AS criterion_code
    FROM assessment.task_objective_evidence_spec spec
    JOIN catalog.learning_objective_revision lor ON lor.id = spec.objective_revision_id
    JOIN catalog.learning_objective lo ON lo.id = lor.learning_objective_id
    JOIN catalog.objective_criterion c ON c.objective_revision_id = lor.id
    WHERE spec.evidence_strength = 'direct'
      AND NOT EXISTS (
        SELECT 1
        FROM assessment.observable_criterion_mapping m
        JOIN assessment.evidence_spec_observable obs ON obs.id = m.evidence_spec_observable_id
        WHERE obs.evidence_spec_id = spec.id AND m.objective_criterion_id = c.id
      )
  `);
  expect(result.rows).toEqual([]);
});

async function specIdFor(objectiveCode: string): Promise<string> {
  const result = await db.execute(sql`
    SELECT spec.id
    FROM assessment.task_objective_evidence_spec spec
    JOIN catalog.learning_objective_revision lor ON lor.id = spec.objective_revision_id
    JOIN catalog.learning_objective lo ON lo.id = lor.learning_objective_id
    WHERE lo.canonical_code = ${objectiveCode}
  `);
  const id = result.rows[0]?.id;
  if (typeof id !== "string") throw new Error(`no spec for ${objectiveCode}`);
  return id;
}

test("propagation fails when a required criterion has no successful observable", async () => {
  const learnerId = await createLearner(db, "vacuous-guard");
  const observationId = await recordObservation(db, {
    learnerId,
    objectiveRevisionId: await objectiveId(db, "RUST-NET-L3-001"),
    evidenceSpecId: await specIdFor("RUST-NET-L3-001"),
    result: "successful",
    evidenceStrength: "direct",
    independenceLevel: 3,
    transferLevel: "near",
    // Deliberately NO observable results: nothing is established.
    observableResults: [],
  });

  const propagation = await propagateFromObservation(db, observationId);
  expect(propagation.createdProxyObservationIds).toEqual([]);
  expect(propagation.skipped.some((s) => /criteri/i.test(s.reason))).toBe(true);
});

test("propagation fails when a critical-error criterion is triggered", async () => {
  const learnerId = await createLearner(db, "critical-error-guard");
  const observationId = await recordObservation(db, {
    learnerId,
    objectiveRevisionId: await objectiveId(db, "RUST-NET-L3-001"),
    evidenceSpecId: await specIdFor("RUST-NET-L3-001"),
    result: "successful",
    evidenceStrength: "direct",
    independenceLevel: 3,
    transferLevel: "near",
    observableResults: [
      { code: "buffer-preservation", result: "successful" },
      { code: "multiple-frames", result: "successful" },
      { code: "partial-header", result: "successful" },
      { code: "partial-body", result: "successful" },
      // Positive polarity: data-integrity FAILING means data WAS lost.
      { code: "data-integrity", result: "unsuccessful" },
    ],
  });

  const propagation = await propagateFromObservation(db, observationId);
  expect(propagation.createdProxyObservationIds).toEqual([]);
  expect(propagation.skipped.some((s) => /critical/i.test(s.reason))).toBe(true);
});
