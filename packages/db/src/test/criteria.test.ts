import { sql } from "drizzle-orm";
import { afterAll, expect, test } from "vitest";
import * as schema from "../schema/index";
import { propagateFromObservation, recordObservation } from "../services/evidence";
import { createLearner, expectRejectionMatching, objectiveId, releaseId, withDb } from "./helpers";

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
    transferDistance: "near",
    performanceScope: "focused",
    // Deliberately NO observable results: nothing is established.
    observableResults: [],
  });

  const propagation = await propagateFromObservation(db, observationId);
  // Assert behavior, not the wording of a skip reason: an attempt with no
  // mapped observables at all must not mint proxy evidence, full stop.
  expect(propagation.createdProxyObservationIds).toEqual([]);
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
    transferDistance: "near",
    performanceScope: "focused",
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

test("a criterion is not established when one of its mapped observables failed", async () => {
  // partial-header and partial-body both map to split-header-and-body. One
  // succeeding must not let it be established when the other failed — a
  // passing sibling cannot outvote a failing measurement of the same claim.
  const learnerId = await createLearner(db, "split-vote-guard");
  const observationId = await recordObservation(db, {
    learnerId,
    objectiveRevisionId: await objectiveId(db, "RUST-NET-L3-001"),
    evidenceSpecId: await specIdFor("RUST-NET-L3-001"),
    result: "successful",
    evidenceStrength: "direct",
    independenceLevel: 3,
    transferDistance: "near",
    performanceScope: "focused",
    observableResults: [
      { code: "buffer-preservation", result: "successful" },
      { code: "multiple-frames", result: "successful" },
      { code: "partial-header", result: "unsuccessful" },
      { code: "partial-body", result: "successful" },
      { code: "data-integrity", result: "successful" },
    ],
  });

  const propagation = await propagateFromObservation(db, observationId);
  // split-header-and-body is required by RUST-NET-L3-001 -> RUST-NET-L2-003
  // and must not be established, so no proxy should be minted.
  expect(propagation.createdProxyObservationIds).toEqual([]);
});

test("a critical-error criterion that was never measured blocks propagation", async () => {
  // data-integrity is the only observable mapped to no-data-loss (a
  // critical_error criterion). Omitting it entirely must not read as "no
  // data loss occurred" — it must block exactly like a triggered failure.
  const learnerId = await createLearner(db, "unmeasured-critical-guard");
  const observationId = await recordObservation(db, {
    learnerId,
    objectiveRevisionId: await objectiveId(db, "RUST-NET-L3-001"),
    evidenceSpecId: await specIdFor("RUST-NET-L3-001"),
    result: "successful",
    evidenceStrength: "direct",
    independenceLevel: 3,
    transferDistance: "near",
    performanceScope: "focused",
    observableResults: [
      { code: "buffer-preservation", result: "successful" },
      { code: "multiple-frames", result: "successful" },
      { code: "partial-header", result: "successful" },
      { code: "partial-body", result: "successful" },
      // data-integrity deliberately omitted: no-data-loss is never measured.
    ],
  });

  const propagation = await propagateFromObservation(db, observationId);
  expect(propagation.createdProxyObservationIds).toEqual([]);
  expect(propagation.skipped.some((s) => /not measured/i.test(s.reason))).toBe(true);
});

test("a fully_subsumes rule with no required criteria refuses to propagate", async () => {
  // Deliberately construct a rule the seed data would never produce: a
  // fully_subsumes implication with zero rows in
  // objective_evidence_implication_criterion. This is exactly the shape that
  // let RUST-NET-L4-001 -> RUST-NET-L3-003 propagate ungated before the
  // required criteria were seeded for it.
  const [implication] = await db
    .insert(schema.objectiveEvidenceImplication)
    .values({
      frameworkReleaseId: await releaseId(db),
      sourceObjectiveRevisionId: await objectiveId(db, "RUST-NET-L3-001"),
      targetObjectiveRevisionId: await objectiveId(db, "RUST-NET-L2-004"),
      implicationType: "fully_subsumes",
      derivedEvidenceStrength: "direct",
      maximumTargetState: "demonstrated",
      automatic: true,
      validationStatus: "approved",
      rationale: "test-only: fully_subsumes rule with no required criteria",
    })
    .returning({ id: schema.objectiveEvidenceImplication.id });
  if (!implication) throw new Error("failed to insert test implication");

  try {
    const learnerId = await createLearner(db, "ungated-subsumes-guard");
    const observationId = await recordObservation(db, {
      learnerId,
      objectiveRevisionId: await objectiveId(db, "RUST-NET-L3-001"),
      evidenceSpecId: await specIdFor("RUST-NET-L3-001"),
      result: "successful",
      evidenceStrength: "direct",
      independenceLevel: 3,
      transferDistance: "near",
      performanceScope: "focused",
      // Only measure the critical-error criterion (as successful, so it
      // doesn't block globally) and nothing else: the point is that a
      // fully_subsumes rule with zero required criteria must refuse
      // regardless of what the source evidence established. (The unrelated
      // RUST-NET-L3-001 -> RUST-NET-L2-003 rule is also skipped here, but for
      // the ordinary "not established" reason, since its criteria weren't
      // observed either.)
      observableResults: [{ code: "data-integrity", result: "successful" }],
    });

    const propagation = await propagateFromObservation(db, observationId);
    // An ungated fully_subsumes rule must not mint proxy evidence.
    expect(propagation.createdProxyObservationIds).toEqual([]);
    expect(propagation.skipped.some((s) => /no required criteria/i.test(s.reason))).toBe(true);
  } finally {
    // This implication exists only to exercise the guard; the invariant test
    // below asserts no such rule survives in seeded data.
    await db.delete(schema.objectiveEvidenceImplication).where(sql`id = ${implication.id}`);
  }
});

test("proxy propagation is gated by the source attempt's administration ceiling", async () => {
  // recordObservation enforces the administration's effective ceiling for
  // DIRECT evidence (see ceiling.test.ts); proxy propagation must not be a
  // back door around the same limit. All three seeded implication rules
  // happen to point downward, so this is unreachable on seeded data — it
  // becomes reachable the moment anyone authors an upward rule, which this
  // test does deliberately: a real L2 ceiling administration, propagating to
  // an L3 target it could never establish directly.
  const learnerId = await createLearner(db, "proxy-ceiling-guard");

  const administration = await db.execute(sql`
    SELECT ta.id FROM assessment.task_administration ta
    WHERE ta.mode = 'practice' AND ta.effective_evidence_ceiling = 2
    LIMIT 1
  `);
  const administrationId = administration.rows[0]?.id;
  if (typeof administrationId !== "string") throw new Error("no L2 practice administration seeded");

  const [attempt] = await db
    .insert(schema.learnerAttempt)
    .values({ learnerId, taskAdministrationId: administrationId, attemptStatus: "completed" })
    .returning({ id: schema.learnerAttempt.id });
  if (!attempt) throw new Error("failed to create attempt");

  // NET-TCP-L1-001 (mastery L1) has no critical_error criteria, so a
  // spec-less observation isn't blocked by the unmeasured-critical-error gate
  // this file exercises elsewhere — the point here is the ceiling gate alone.
  const sourceObjective = await objectiveId(db, "NET-TCP-L1-001");
  // RUST-NET-L3-001 (mastery L3) sits above the L2 ceiling.
  const targetObjective = await objectiveId(db, "RUST-NET-L3-001");

  const [implication] = await db
    .insert(schema.objectiveEvidenceImplication)
    .values({
      frameworkReleaseId: await releaseId(db),
      sourceObjectiveRevisionId: sourceObjective,
      targetObjectiveRevisionId: targetObjective,
      // evidence_supports is exempt from the "must have required criteria"
      // guard, so zero required criteria is legitimate here and doesn't
      // confound the ceiling check under test.
      implicationType: "evidence_supports",
      derivedEvidenceStrength: "supporting",
      maximumTargetState: "developing",
      automatic: true,
      validationStatus: "approved",
      rationale: "test-only: upward implication proving proxy propagation respects the ceiling",
    })
    .returning({ id: schema.objectiveEvidenceImplication.id });
  if (!implication) throw new Error("failed to insert test implication");

  try {
    const observationId = await recordObservation(db, {
      learnerId,
      attemptId: attempt.id,
      objectiveRevisionId: sourceObjective,
      result: "successful",
      evidenceStrength: "direct",
      independenceLevel: 3,
      transferDistance: "near",
      performanceScope: "focused",
    });

    const propagation = await propagateFromObservation(db, observationId);
    expect(propagation.createdProxyObservationIds).toEqual([]);
    expect(propagation.skipped.some((s) => /ceiling/i.test(s.reason))).toBe(true);
  } finally {
    await db.delete(schema.objectiveEvidenceImplication).where(sql`id = ${implication.id}`);
  }
});

test("a fully_subsumes rule propagates when every required criterion is established", async () => {
  // Every other propagation test in this file is a refusal test. This is the
  // positive path: RUST-NET-L4-001 -> RUST-NET-L3-003 propagates when its
  // task evidence spec measures every criterion (including the critical_error
  // no-unverified-attribution) and all of them succeed.
  const learnerId = await createLearner(db, "positive-propagation");
  const observationId = await recordObservation(db, {
    learnerId,
    objectiveRevisionId: await objectiveId(db, "RUST-NET-L4-001"),
    evidenceSpecId: await specIdFor("RUST-NET-L4-001"),
    result: "successful",
    evidenceStrength: "direct",
    independenceLevel: 3,
    transferDistance: "near",
    performanceScope: "composite",
    observableResults: [
      { code: "mechanism-discrimination", result: "successful" },
      { code: "competing-explanations-ruled-out", result: "successful" },
      { code: "load-verification", result: "successful" },
      { code: "attribution-check", result: "successful" },
    ],
  });

  const propagation = await propagateFromObservation(db, observationId);
  expect(propagation.createdProxyObservationIds).toHaveLength(1);

  const [proxyId] = propagation.createdProxyObservationIds;
  const proxyRow = await db.execute(sql`
    SELECT o.origin, o.evidence_strength, lo.canonical_code
    FROM evidence.observation o
    JOIN catalog.learning_objective_revision lor ON lor.id = o.objective_revision_id
    JOIN catalog.learning_objective lo ON lo.id = lor.learning_objective_id
    WHERE o.id = ${proxyId}
  `);
  expect(proxyRow.rows[0]?.canonical_code).toBe("RUST-NET-L3-003");
  expect(proxyRow.rows[0]?.origin).toBe("proxy");
  expect(proxyRow.rows[0]?.evidence_strength).toBe("direct");
});

test("a spec-less observation never propagates (unmeasured critical error blocks it)", async () => {
  // Adaptive knowledge checks record with no evidence spec at all, so
  // `observed` is always empty for them. That silently ended propagation for
  // RUST-NET-L3-003 -> NET-TCP-L1-003 when the critical-error gate landed
  // (see evidence.ts). Pin the behavior here rather than leaving it incidental.
  const learnerId = await createLearner(db, "spec-less-guard");
  const observationId = await recordObservation(db, {
    learnerId,
    objectiveRevisionId: await objectiveId(db, "RUST-NET-L4-001"),
    result: "successful",
    evidenceStrength: "direct",
    independenceLevel: 3,
    transferDistance: "near",
    performanceScope: "composite",
    // No evidenceSpecId and no observableResults: nothing was measured.
  });

  const propagation = await propagateFromObservation(db, observationId);
  expect(propagation.createdProxyObservationIds).toEqual([]);
  expect(propagation.skipped.some((s) => /not measured/i.test(s.reason))).toBe(true);
});

test("every seeded fully_subsumes implication requires at least one criterion", async () => {
  const result = await db.execute(sql`
    SELECT i.id, slo.canonical_code AS source_code, tlo.canonical_code AS target_code
    FROM catalog.objective_evidence_implication i
    JOIN catalog.learning_objective_revision slor ON slor.id = i.source_objective_revision_id
    JOIN catalog.learning_objective slo ON slo.id = slor.learning_objective_id
    JOIN catalog.learning_objective_revision tlor ON tlor.id = i.target_objective_revision_id
    JOIN catalog.learning_objective tlo ON tlo.id = tlor.learning_objective_id
    WHERE i.implication_type = 'fully_subsumes'
      AND NOT EXISTS (
        SELECT 1 FROM catalog.objective_evidence_implication_criterion ic
        WHERE ic.implication_id = i.id
      )
  `);
  expect(result.rows).toEqual([]);
});

test("a task evidence spec cannot omit its transfer-distance or performance-scope gate", async () => {
  // These two columns used to be bare .notNull() (as minimumTransfer was
  // before the transfer/scope split); a later pass gave them .default(...),
  // so a forgotten seed value would silently install the WEAKEST possible
  // gate ("same"/"focused") instead of failing loudly at insert. Restoring
  // bare .notNull() (no default) means Postgres itself refuses the row.
  const suffix = crypto.randomUUID();
  const [template] = await db
    .insert(schema.taskTemplate)
    .values({ canonicalCode: `SCRATCH-EVIDENCE-GATE-${suffix}` })
    .returning({ id: schema.taskTemplate.id });
  if (!template) throw new Error("failed to insert scratch task template");
  const [revision] = await db
    .insert(schema.taskRevision)
    .values({
      taskTemplateId: template.id,
      revisionNo: 1,
      frameworkReleaseId: await releaseId(db),
      title: "Scratch task (evidence gate test)",
      taskKind: "exercise",
      scenario: "scratch",
      designEvidenceCeiling: 5,
    })
    .returning({ id: schema.taskRevision.id });
  if (!revision) throw new Error("failed to insert scratch task revision");

  try {
    await expectRejectionMatching(
      db.execute(sql`
        INSERT INTO assessment.task_objective_evidence_spec
          (task_revision_id, objective_revision_id, claim_role, evidence_strength, minimum_independence)
        VALUES (
          ${revision.id},
          ${await objectiveId(db, "NET-TCP-L1-001")},
          'primary', 'direct', 2
        )
      `),
      /null value.*column "minimum_transfer_distance"|violates not-null constraint/i,
    );
  } finally {
    await db.delete(schema.taskRevision).where(sql`id = ${revision.id}`);
    await db.delete(schema.taskTemplate).where(sql`id = ${template.id}`);
  }
});
