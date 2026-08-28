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

// Excludes `explanation` observables: an explanation observable may be purely
// context-setting (e.g. RUST-NET-L3-001's `framing-model`, which establishes
// the byte-stream mental model but demonstrates no criterion of its own
// objective) and is not required to map to a criterion. Coverage of every
// criterion is enforced criterion-side by `uncoveredCriteria` in
// publication.ts; this test guards the observable side for every other
// observable type, where an unmapped observable is a real gap.
test("every direct evidence spec observable maps to at least one criterion", async () => {
  const result = await db.execute(sql`
    SELECT obs.code
    FROM assessment.evidence_spec_observable obs
    JOIN assessment.task_objective_evidence_spec spec ON spec.id = obs.evidence_spec_id
    WHERE spec.evidence_strength = 'direct'
      AND obs.observable_type <> 'explanation'
      AND NOT EXISTS (
        SELECT 1 FROM assessment.observable_criterion_mapping m
        WHERE m.evidence_spec_observable_id = obs.id
      )
  `);
  expect(result.rows).toEqual([]);
});
