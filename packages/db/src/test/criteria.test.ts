import { sql } from "drizzle-orm";
import { afterAll, expect, test } from "vitest";
import { withDb } from "./helpers";

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
