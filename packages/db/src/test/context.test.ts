import { eq, sql } from "drizzle-orm";
import { afterAll, expect, test } from "vitest";
import * as s from "../schema/index";
import { recalculateForObservations } from "../services/assertions";
import { ContextService, canonicalContextKey } from "../services/context";
import { recordObservation } from "../services/evidence";
import { checkObjectiveSatisfaction } from "../services/role-state";
import { createLearner, objectiveId, withDb } from "./helpers";

const { db, pool } = withDb();
afterAll(async () => {
  await pool.end();
});

/**
 * pg errors surface through drizzle as `Error: Failed query: ...` with the
 * real database message on `.cause`. Assert against that, not the wrapper.
 */
async function expectRejectionMatching(query: Promise<unknown>, pattern: RegExp): Promise<void> {
  try {
    await query;
    throw new Error(`expected query to be rejected matching ${pattern}`);
  } catch (err) {
    const cause = err instanceof Error && err.cause instanceof Error ? err.cause : err;
    const message = cause instanceof Error ? cause.message : String(cause);
    expect(message).toMatch(pattern);
  }
}

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
