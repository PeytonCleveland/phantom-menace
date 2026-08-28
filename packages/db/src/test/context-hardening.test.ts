import { eq, sql } from "drizzle-orm";
import { afterAll, expect, test } from "vitest";
import * as s from "../schema/index";
import { recalculateAssertionsForObjective } from "../services/assertions";
import { ContextService } from "../services/context";
import { recordObservation } from "../services/evidence";
import { computeFrontier } from "../services/projections";
import { checkObjectiveSatisfaction, type EvidencePolicyCheck } from "../services/role-state";
import { createLearner, objectiveId, seRoleLevelRevisionId, withDb } from "./helpers";

/**
 * Task 14: context correctness hardening.
 *
 * These gaps are dormant in the seeded catalog today because nothing yet
 * declares a required context dimension or a context-pinned requirement
 * (that lands in Task 11). Every fixture below manufactures the context
 * scoping by hand so the gaps are exercised now, before they go live.
 */

const { db, pool } = withDb();
afterAll(async () => {
  await pool.end();
});

const BASE_POLICY: EvidencePolicyCheck = {
  directEvidenceRequired: false,
  proxyEvidenceAllowed: true,
  minimumIndependence: null,
  minimumTransferDistance: null,
  minimumPerformanceScope: null,
  maximumEvidenceAge: null,
  contexts: [],
};

test("the frontier collapses two context-scoped assertions into one entry", async () => {
  // A role-required objective with two context-scoped assertion rows (unique
  // on learner+objective+context_key, so this is representable) must still
  // produce exactly one frontier candidate: the frontier answers "what
  // should I learn next", not "what am I qualified for in every context".
  const learnerId = await createLearner(db, "frontier-context-collapse");
  const objectiveRevisionId = await objectiveId(db, "NET-TCP-L1-001");
  const roleLevelRevisionId = await seRoleLevelRevisionId(db);

  await db.insert(s.objectiveAssertion).values([
    {
      learnerId,
      objectiveRevisionId,
      contextKey: "cloud_provider=aws",
      state: "developing",
      confidence: "0.400",
      inferenceModelVersion: "test-fixture",
    },
    {
      learnerId,
      objectiveRevisionId,
      contextKey: "cloud_provider=azure",
      state: "stale",
      confidence: "0.300",
      inferenceModelVersion: "test-fixture",
    },
  ]);

  const frontier = await computeFrontier(db, learnerId, roleLevelRevisionId);
  const matches = frontier.available.filter((e) => e.objectiveRevisionId === objectiveRevisionId);
  expect(matches).toHaveLength(1);
});

test("the hard-prerequisite join does not multiply a context-scoped prerequisite", async () => {
  // NET-TCP-L1-001 (used above) has no inbound hard prerequisite, so it only
  // exercises the `states` CTE collapse. RUST-NET-L2-003 is a hard
  // prerequisite of RUST-NET-L3-001 — giving IT two context-scoped
  // assertions is what exercises the `ps` join's reuse of that same
  // collapse. Without it, RUST-NET-L3-001's hard_prerequisites JSON would
  // list RUST-NET-L2-003 twice (once per context-scoped assertion row).
  const learnerId = await createLearner(db, "frontier-prereq-collapse");
  const prereqObjectiveRevisionId = await objectiveId(db, "RUST-NET-L2-003");
  const roleLevelRevisionId = await seRoleLevelRevisionId(db);

  await db.insert(s.objectiveAssertion).values([
    {
      learnerId,
      objectiveRevisionId: prereqObjectiveRevisionId,
      contextKey: "cloud_provider=aws",
      state: "developing",
      confidence: "0.400",
      inferenceModelVersion: "test-fixture",
    },
    {
      learnerId,
      objectiveRevisionId: prereqObjectiveRevisionId,
      contextKey: "cloud_provider=azure",
      state: "stale",
      confidence: "0.300",
      inferenceModelVersion: "test-fixture",
    },
  ]);

  const frontier = await computeFrontier(db, learnerId, roleLevelRevisionId);
  const blocked = frontier.blocked.filter((b) => b.canonicalCode === "RUST-NET-L3-001");
  expect(blocked).toHaveLength(1);
  expect([...(blocked[0]?.blockedBy ?? [])].sort()).toEqual(["NET-TCP-L1-003", "RUST-NET-L2-003"]);
});

test("the observation scan only considers evidence in the pinned context", async () => {
  // A weak IN-context assertion plus a strong OUT-of-context observation must
  // not pass the policy gate: context scoping has to apply to the quality
  // checks (independence here), not just to "is there an assertion at all".
  const suffix = crypto.randomUUID();
  const dim = `t14_step2_dim_${suffix}`;
  const svc = new ContextService(db);
  await svc.createDimension({ code: dim, name: "Test Step 2 Dimension" });
  const inValueId = await svc.createValue({ dimensionCode: dim, code: "in_val", name: "In" });
  const outValueId = await svc.createValue({ dimensionCode: dim, code: "out_val", name: "Out" });
  const learnerId = await createLearner(db, "observation-scan-context");

  try {
    const objectiveRevisionId = await objectiveId(db, "RUST-NET-L4-003");

    const [assertion] = await db
      .insert(s.objectiveAssertion)
      .values({
        learnerId,
        objectiveRevisionId,
        contextKey: `${dim}=in_val`,
        state: "demonstrated",
        confidence: "0.900",
        inferenceModelVersion: "test-fixture",
      })
      .returning({ id: s.objectiveAssertion.id });
    if (!assertion) throw new Error("failed to insert test assertion");
    await db.insert(s.objectiveAssertionContext).values({
      assertionId: assertion.id,
      dimensionCode: dim,
      contextValueId: inValueId,
    });

    // Strong evidence (independence 4 >= the policy's minimum of 3) but
    // scoped to the WRONG value of the pinned dimension.
    const observationId = await recordObservation(db, {
      learnerId,
      objectiveRevisionId,
      result: "successful",
      evidenceStrength: "direct",
      independenceLevel: 4,
      transferDistance: "near",
      performanceScope: "focused",
      contexts: { [dim]: "out_val" },
    });

    const policy: EvidencePolicyCheck = {
      ...BASE_POLICY,
      minimumIndependence: 3,
      contexts: [{ dimensionCode: dim, valueCode: "in_val", minimumDistinctValues: 1 }],
    };

    const result = await checkObjectiveSatisfaction(db, learnerId, objectiveRevisionId, policy);
    expect(result.satisfied).toBe(false);

    // Sanity: the same observation DOES qualify once it is recorded in the
    // pinned context, proving the failure above is about context, not about
    // the observation being otherwise disqualified.
    await recordObservation(db, {
      learnerId,
      objectiveRevisionId,
      result: "successful",
      evidenceStrength: "direct",
      independenceLevel: 4,
      transferDistance: "near",
      performanceScope: "focused",
      contexts: { [dim]: "in_val" },
    });
    const inContextResult = await checkObjectiveSatisfaction(
      db,
      learnerId,
      objectiveRevisionId,
      policy,
    );
    expect(inContextResult.satisfied).toBe(true);
    void observationId;
    void outValueId;
  } finally {
    // Observations are append-only, but observation_context and the
    // assertion rows are not — clear both before the catalog rows they
    // reference, or the composite FK (Task 14 step 5) refuses the delete.
    await db.delete(s.observationContext).where(sql`dimension_code = ${dim}`);
    await db.delete(s.objectiveAssertion).where(eq(s.objectiveAssertion.learnerId, learnerId));
    await db.delete(s.contextValue).where(sql`dimension_code = ${dim}`);
    await db.delete(s.contextDimension).where(sql`code = ${dim}`);
  }
});

test("breadth counting is scoped to the requirement's other pinned dimensions", async () => {
  // A requirement pinning cloud=aws and demanding breadth >= 2 on env must
  // not count env values from assertions that fail the aws pin.
  const suffix = crypto.randomUUID();
  const cloudDim = `t14_step3_cloud_${suffix}`;
  const envDim = `t14_step3_env_${suffix}`;
  const svc = new ContextService(db);
  await svc.createDimension({ code: cloudDim, name: "Test Step 3 Cloud" });
  await svc.createDimension({ code: envDim, name: "Test Step 3 Env" });
  const awsId = await svc.createValue({ dimensionCode: cloudDim, code: "aws", name: "AWS" });
  const azureId = await svc.createValue({ dimensionCode: cloudDim, code: "azure", name: "Azure" });
  const prodId = await svc.createValue({ dimensionCode: envDim, code: "prod", name: "Prod" });
  const stagingId = await svc.createValue({
    dimensionCode: envDim,
    code: "staging",
    name: "Staging",
  });
  const learnerId = await createLearner(db, "breadth-scope-guard");

  try {
    const objectiveRevisionId = await objectiveId(db, "RUST-NET-L4-002");

    async function insertAssertion(
      contextKey: string,
      cloudValueId: string,
      envValueId: string,
    ): Promise<void> {
      const [assertion] = await db
        .insert(s.objectiveAssertion)
        .values({
          learnerId,
          objectiveRevisionId,
          contextKey,
          state: "demonstrated",
          confidence: "0.900",
          inferenceModelVersion: "test-fixture",
        })
        .returning({ id: s.objectiveAssertion.id });
      if (!assertion) throw new Error("failed to insert test assertion");
      await db.insert(s.objectiveAssertionContext).values([
        { assertionId: assertion.id, dimensionCode: cloudDim, contextValueId: cloudValueId },
        { assertionId: assertion.id, dimensionCode: envDim, contextValueId: envValueId },
      ]);
    }

    // Assertion A satisfies the aws pin; assertion B does not.
    await insertAssertion(`${cloudDim}=aws;${envDim}=prod`, awsId, prodId);
    await insertAssertion(`${cloudDim}=azure;${envDim}=staging`, azureId, stagingId);

    // Qualifying direct observation, scoped to the pinned (aws) value only —
    // proves via step 2's fix that this observation is reachable at all.
    await recordObservation(db, {
      learnerId,
      objectiveRevisionId,
      result: "successful",
      evidenceStrength: "direct",
      independenceLevel: 3,
      transferDistance: "near",
      performanceScope: "focused",
      contexts: { [cloudDim]: "aws" },
    });

    const policy: EvidencePolicyCheck = {
      ...BASE_POLICY,
      minimumIndependence: 3,
      minimumTransferDistance: "near",
      minimumPerformanceScope: "focused",
      contexts: [
        { dimensionCode: cloudDim, valueCode: "aws", minimumDistinctValues: 1 },
        { dimensionCode: envDim, valueCode: null, minimumDistinctValues: 2 },
      ],
    };

    const result = await checkObjectiveSatisfaction(db, learnerId, objectiveRevisionId, policy);
    // Only assertion A satisfies the cloud=aws pin, so only 1 distinct env
    // value (prod) counts — below the required 2 — even though 2 distinct
    // env values exist across ALL of the learner's assertions for this
    // objective.
    expect(result.satisfied).toBe(false);
    expect(result.reason).toMatch(new RegExp(envDim));
  } finally {
    await db.delete(s.observationContext).where(sql`dimension_code IN (${cloudDim}, ${envDim})`);
    await db.delete(s.objectiveAssertion).where(eq(s.objectiveAssertion.learnerId, learnerId));
    await db.delete(s.contextValue).where(sql`dimension_code IN (${cloudDim}, ${envDim})`);
    await db.delete(s.contextDimension).where(sql`code IN (${cloudDim}, ${envDim})`);
  }
});

test("an observation missing a newly-required context dimension is skipped, visibly", async () => {
  // Spec §1: evidence that never carried a required dimension cannot
  // establish a scoped claim, and the assertion disappearing is correct. But
  // it must not be silent — recalculateAssertionsForObjective must count it.
  const suffix = crypto.randomUUID();
  const dim = `t14_step4_dim_${suffix}`;
  const svc = new ContextService(db);
  await svc.createDimension({ code: dim, name: "Test Step 4 Dimension" });
  await svc.createValue({ dimensionCode: dim, code: "only_val", name: "Only" });

  // Mutates shared catalog state (a required-dimension policy on the seeded
  // RUST-NET-L4-002), not just this test's own learner. Safe only because
  // vitest.config.ts sets fileParallelism: false, so no other test file can
  // observe this objective mid-mutation; if that ever changes, this needs
  // its own catalog fixture instead.
  const objectiveRevisionId = await objectiveId(db, "RUST-NET-L4-002");
  await db.insert(s.objectiveContextPolicy).values({
    objectiveRevisionId,
    dimensionCode: dim,
    policy: "required",
  });

  try {
    const learnerId = await createLearner(db, "skipped-incomplete-context");

    // Deliberately no `contexts` on this observation: it cannot satisfy the
    // newly-required dimension.
    await recordObservation(db, {
      learnerId,
      objectiveRevisionId,
      result: "successful",
      evidenceStrength: "direct",
      independenceLevel: 4,
      transferDistance: "near",
      performanceScope: "focused",
    });

    const { outcomes, diagnostics } = await recalculateAssertionsForObjective(
      db,
      learnerId,
      objectiveRevisionId,
    );

    expect(outcomes).toHaveLength(0);
    expect(diagnostics.skippedIncompleteContext).toBe(1);
  } finally {
    await db
      .delete(s.objectiveContextPolicy)
      .where(sql`objective_revision_id = ${objectiveRevisionId} AND dimension_code = ${dim}`);
    await db.delete(s.contextValue).where(sql`dimension_code = ${dim}`);
    await db.delete(s.contextDimension).where(sql`code = ${dim}`);
  }
});
