import { sql } from "drizzle-orm";
import { afterAll, expect, test } from "vitest";
import { withDb } from "./helpers";

const { db, pool } = withDb();
afterAll(async () => {
  await pool.end();
});

// unskipped in Task 5, which seeds the criteria these assert on
test.skip("RUST-NET-L3-001 has structured criteria including a blocking critical error", async () => {
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

// unskipped in Task 5, which seeds the criteria these assert on
test.skip("every direct evidence spec observable maps to at least one criterion", async () => {
  const result = await db.execute(sql`
    SELECT obs.code
    FROM assessment.evidence_spec_observable obs
    JOIN assessment.task_objective_evidence_spec spec ON spec.id = obs.evidence_spec_id
    WHERE spec.evidence_strength = 'direct'
      AND NOT EXISTS (
        SELECT 1 FROM assessment.observable_criterion_mapping m
        WHERE m.evidence_spec_observable_id = obs.id
      )
  `);
  expect(result.rows).toEqual([]);
});
