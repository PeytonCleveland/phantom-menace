import { eq, sql } from "drizzle-orm";
import { afterAll, expect, test } from "vitest";
import * as s from "../schema/index";
import { recalculateForObservations } from "../services/assertions";
import { CatalogSession, createRelease, ensureFramework } from "../services/catalog";
import { ContextService, canonicalContextKey } from "../services/context";
import { recordObservation } from "../services/evidence";
import { checkObjectiveSatisfaction } from "../services/role-state";
import { createLearner, expectRejectionMatching, objectiveId, withDb } from "./helpers";

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
  // `_` sorts before `p` in byte order but is near-ignorable under en_US.utf8
  // collation, which would order these the other way around.
  expect(canonicalContextKey({ cloud_provider: "x", cloudiness: "y" })).toBe(
    "cloud_provider=x;cloudiness=y",
  );
});

test("the database canonicalization agrees with the TypeScript mirror", async () => {
  const cases: Array<Record<string, string>> = [
    {},
    { cloud_provider: "aws" },
    { programming_language: "rust", cloud_provider: "aws_govcloud" },
    { cloud_provider: "x", cloudiness: "y" },
  ];
  for (const contexts of cases) {
    const result = await db.execute(
      sql`SELECT governance.canonical_context_key(${JSON.stringify(contexts)}::jsonb) AS key`,
    );
    expect(result.rows[0]?.key).toBe(canonicalContextKey(contexts));
  }
});

test("a context value cannot take a parent from a different dimension", async () => {
  const suffix = crypto.randomUUID();
  const dimA = `test_dim_a_${suffix}`;
  const dimB = `test_dim_b_${suffix}`;
  const svc = new ContextService(db);

  try {
    await svc.createDimension({ code: dimA, name: "Test Dimension A" });
    await svc.createDimension({ code: dimB, name: "Test Dimension B" });
    const parentId = await svc.createValue({ dimensionCode: dimA, code: "root", name: "Root" });

    await expectRejectionMatching(
      db.insert(s.contextValue).values({
        dimensionCode: dimB,
        code: "child",
        name: "Child",
        parentValueId: parentId,
      }),
      /parent belongs to dimension/,
    );
  } finally {
    await db.delete(s.contextValue).where(eq(s.contextValue.dimensionCode, dimA));
    await db.delete(s.contextValue).where(eq(s.contextValue.dimensionCode, dimB));
    await db.delete(s.contextDimension).where(eq(s.contextDimension.code, dimA));
    await db.delete(s.contextDimension).where(eq(s.contextDimension.code, dimB));
  }
});

test("an update that would create a parent cycle is rejected", async () => {
  const suffix = crypto.randomUUID();
  const dim = `test_dim_cycle_${suffix}`;
  const svc = new ContextService(db);

  try {
    await svc.createDimension({ code: dim, name: "Test Cycle Dimension" });
    const aId = await svc.createValue({ dimensionCode: dim, code: "a", name: "A" });
    const bId = await svc.createValue({
      dimensionCode: dim,
      code: "b",
      name: "B",
      parentCode: "a",
    });

    await expectRejectionMatching(
      db.update(s.contextValue).set({ parentValueId: bId }).where(eq(s.contextValue.id, aId)),
      /parent cycle/,
    );
  } finally {
    await db.delete(s.contextValue).where(eq(s.contextValue.dimensionCode, dim));
    await db.delete(s.contextDimension).where(eq(s.contextDimension.code, dim));
  }
});

test("an objective with no required dimensions keys its assertion to the empty string", async () => {
  const learnerId = await createLearner(db, "ctx-empty-key");
  const target = await objectiveId(db, "NET-TCP-L1-001");

  const observationId = await recordObservation(db, {
    learnerId,
    objectiveRevisionId: target,
    result: "successful",
    evidenceStrength: "direct",
    independenceLevel: 4,
    transferDistance: "near",
    performanceScope: "focused",
  });
  const results = await recalculateForObservations(db, [observationId]);

  const forObjective = results.get(target)?.outcomes;
  expect(forObjective).toHaveLength(1);
  expect(forObjective?.[0]?.contextKey).toBe("");
  expect(forObjective?.[0]?.state).toBe("demonstrated");
});

const cloudPolicy = (valueCode: string | null) => ({
  directEvidenceRequired: false,
  proxyEvidenceAllowed: true,
  minimumIndependence: null,
  minimumTransferDistance: null,
  minimumPerformanceScope: null,
  maximumEvidenceAge: null,
  contexts: [{ dimensionCode: "cloud_provider", valueCode, minimumDistinctValues: 1 }],
});

test("GovCloud evidence satisfies an AWS requirement, but not the reverse", async () => {
  const govcloudLearner = await createLearner(db, "ctx-govcloud");
  const target = await objectiveId(db, "CLOUD-DEPLOY-L3-001");

  const observationId = await recordObservation(db, {
    learnerId: govcloudLearner,
    objectiveRevisionId: target,
    result: "successful",
    evidenceStrength: "direct",
    independenceLevel: 4,
    transferDistance: "near",
    performanceScope: "focused",
    contexts: { cloud_provider: "aws_govcloud" },
  });
  await recalculateForObservations(db, [observationId]);

  const asAws = await checkObjectiveSatisfaction(db, govcloudLearner, target, cloudPolicy("aws"));
  expect(asAws.satisfied).toBe(true);

  const awsLearner = await createLearner(db, "ctx-aws");
  const awsObservation = await recordObservation(db, {
    learnerId: awsLearner,
    objectiveRevisionId: target,
    result: "successful",
    evidenceStrength: "direct",
    independenceLevel: 4,
    transferDistance: "near",
    performanceScope: "focused",
    contexts: { cloud_provider: "aws" },
  });
  await recalculateForObservations(db, [awsObservation]);

  const asGovcloud = await checkObjectiveSatisfaction(
    db,
    awsLearner,
    target,
    cloudPolicy("aws_govcloud"),
  );
  expect(asGovcloud.satisfied).toBe(false);

  const asAzure = await checkObjectiveSatisfaction(db, awsLearner, target, cloudPolicy("azure"));
  expect(asAzure.satisfied).toBe(false);
});

test("breadth counting collapses a value and its ancestor into one distinct provider", async () => {
  // aws_govcloud's parent is aws precisely because it is not a different
  // provider (spec §1). A requirement demanding evidence in 2 distinct
  // cloud_provider values must not be satisfied by aws + aws_govcloud alone:
  // both collapse to the same root, so this is still only 1 provider.
  const learnerId = await createLearner(db, "ctx-breadth-same-root");
  const target = await objectiveId(db, "CLOUD-DEPLOY-L3-001");
  const breadthTwo = (dimensionCode: string) => ({
    directEvidenceRequired: false,
    proxyEvidenceAllowed: true,
    minimumIndependence: null,
    minimumTransferDistance: null,
    minimumPerformanceScope: null,
    maximumEvidenceAge: null,
    contexts: [{ dimensionCode, valueCode: null, minimumDistinctValues: 2 }],
  });

  const awsObs = await recordObservation(db, {
    learnerId,
    objectiveRevisionId: target,
    result: "successful",
    evidenceStrength: "direct",
    independenceLevel: 4,
    transferDistance: "near",
    performanceScope: "focused",
    contexts: { cloud_provider: "aws" },
  });
  const govcloudObs = await recordObservation(db, {
    learnerId,
    objectiveRevisionId: target,
    result: "successful",
    evidenceStrength: "direct",
    independenceLevel: 4,
    transferDistance: "near",
    performanceScope: "focused",
    contexts: { cloud_provider: "aws_govcloud" },
  });
  await recalculateForObservations(db, [awsObs, govcloudObs]);

  const sameRoot = await checkObjectiveSatisfaction(
    db,
    learnerId,
    target,
    breadthTwo("cloud_provider"),
  );
  expect(sameRoot.satisfied).toBe(false);
  expect(sameRoot.reason).toMatch(/2 distinct cloud_provider/);

  // A genuinely different provider (a different root) still counts.
  const azureLearner = await createLearner(db, "ctx-breadth-distinct-roots");
  const azureAwsObs = await recordObservation(db, {
    learnerId: azureLearner,
    objectiveRevisionId: target,
    result: "successful",
    evidenceStrength: "direct",
    independenceLevel: 4,
    transferDistance: "near",
    performanceScope: "focused",
    contexts: { cloud_provider: "aws" },
  });
  const azureObs = await recordObservation(db, {
    learnerId: azureLearner,
    objectiveRevisionId: target,
    result: "successful",
    evidenceStrength: "direct",
    independenceLevel: 4,
    transferDistance: "near",
    performanceScope: "focused",
    contexts: { cloud_provider: "azure" },
  });
  await recalculateForObservations(db, [azureAwsObs, azureObs]);

  const distinctRoots = await checkObjectiveSatisfaction(
    db,
    azureLearner,
    target,
    breadthTwo("cloud_provider"),
  );
  expect(distinctRoots.satisfied).toBe(true);
});

test("an observation missing a required dimension cannot produce a demonstrated assertion", async () => {
  const learnerId = await createLearner(db, "ctx-incomplete");
  const target = await objectiveId(db, "CLOUD-DEPLOY-L3-001");

  const observationId = await recordObservation(db, {
    learnerId,
    objectiveRevisionId: target,
    result: "successful",
    evidenceStrength: "direct",
    independenceLevel: 4,
    transferDistance: "near",
    performanceScope: "focused",
    // No cloud_provider, which the objective declares required.
  });
  const results = await recalculateForObservations(db, [observationId]);
  const result = results.get(target);
  expect(result?.outcomes ?? []).toEqual([]);
  expect(result?.diagnostics.skippedIncompleteContext).toBe(1);
});

test("an objective's context-policy whitelist naming a nonexistent value code fails loudly", async () => {
  // This used to reuse the already-seeded cloud-infrastructure.
  // application-deployment competency (belonging to the published SWE 0.1.0
  // release) rather than create a scratch one, on the theory that
  // createObjective's own insert runs inside one transaction, so the thrown
  // error rolls back cleanly with nothing left behind either way. Task 12
  // breaks that: catalog.objective_claim_evidence_constraint is now frozen
  // against INSERT once its objective revision's release is published, and
  // that insert happens (inside the same transaction) *before* the
  // context-policy loop this test means to exercise — so the call would
  // still reject, but with the immutability trigger's message, not the
  // "unknown context value" one under test. A framework release of its own,
  // never published, keeps that trigger out of the way; the transaction
  // still rolls back on the real error, so nothing here needs cleanup.
  const suffix = crypto.randomUUID();
  const frameworkId = await ensureFramework(db, {
    code: `scratch-fw-bad-whitelist-${suffix}`,
    name: "Scratch framework (bad whitelist)",
  });
  const frameworkReleaseId = await createRelease(db, {
    frameworkId,
    version: "0.0.1",
    notes: "Draft-only fixture; never published.",
  });
  const session = new CatalogSession(db, frameworkReleaseId);
  const domainCode = `scratch-domain-bad-whitelist-${suffix}`;
  const competencyCode = `scratch-competency-bad-whitelist-${suffix}`;
  await session.createDomain({ code: domainCode, name: "Scratch domain" });
  await session.createCompetency({
    code: competencyCode,
    name: "Scratch competency",
    primaryDomainCode: domainCode,
  });

  await expect(
    session.createObjective({
      code: `TEST-CTX-BAD-WHITELIST-${suffix}`,
      title: "Test objective with a bad context whitelist",
      statement: "Exists only to exercise a rejected createObjective call.",
      masteryLevel: 1,
      verbCode: "implement",
      defaultAssuranceClass: "B",
      criteria: [],
      claimEvidenceConstraints: {
        practicalPerformanceRequired: false,
        constructedResponseSupported: false,
        multipleChoiceAloneSufficient: false,
        directObservationPossible: true,
      },
      contextPolicies: [
        {
          dimensionCode: "cloud_provider",
          policy: "required",
          allowedValueCodes: ["not-a-real-value-code"],
        },
      ],
      primaryCompetencyCode: competencyCode,
    }),
  ).rejects.toThrow(/unknown context value cloud_provider:not-a-real-value-code/);

  // And confirm the rollback actually happened: no half-created objective.
  const orphan = await db.execute(sql`
    SELECT 1 FROM catalog.learning_objective WHERE canonical_code = ${`TEST-CTX-BAD-WHITELIST-${suffix}`}
  `);
  expect(orphan.rows).toHaveLength(0);

  // The domain/competency/framework/release above were each their own
  // transaction and did commit; clean them up explicitly.
  await db.execute(sql`
    DELETE FROM catalog.domain_competency_membership
    WHERE competency_revision_id IN (
      SELECT cr.id FROM catalog.competency_revision cr
      JOIN catalog.competency c ON c.id = cr.competency_id
      WHERE c.canonical_code = ${competencyCode}
    )
  `);
  await db.execute(sql`
    DELETE FROM catalog.framework_release_competency frc
    USING catalog.competency_revision cr, catalog.competency c
    WHERE frc.competency_revision_id = cr.id AND cr.competency_id = c.id
      AND c.canonical_code = ${competencyCode}
  `);
  await db.execute(sql`
    DELETE FROM catalog.competency_revision cr
    USING catalog.competency c
    WHERE cr.competency_id = c.id AND c.canonical_code = ${competencyCode}
  `);
  await db.execute(sql`DELETE FROM catalog.competency WHERE canonical_code = ${competencyCode}`);
  await db.execute(sql`
    DELETE FROM catalog.framework_release_domain frd
    USING catalog.domain_revision dr, catalog.domain d
    WHERE frd.domain_revision_id = dr.id AND dr.domain_id = d.id AND d.canonical_code = ${domainCode}
  `);
  await db.execute(sql`
    DELETE FROM catalog.domain_revision dr
    USING catalog.domain d
    WHERE dr.domain_id = d.id AND d.canonical_code = ${domainCode}
  `);
  await db.execute(sql`DELETE FROM catalog.domain WHERE canonical_code = ${domainCode}`);
  await db.execute(sql`DELETE FROM catalog.framework_release WHERE id = ${frameworkReleaseId}`);
  await db.execute(sql`DELETE FROM catalog.framework WHERE id = ${frameworkId}`);
});
