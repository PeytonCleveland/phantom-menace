import { and, eq } from "drizzle-orm";
import { afterAll, expect, test } from "vitest";
import * as s from "../schema/index";
import { findContextValueId } from "../services/context";
import { RoleCompiler } from "../services/role-compiler";
import { objectiveId, releaseId, withDb } from "./helpers";

const { db, pool } = withDb();
afterAll(async () => {
  await pool.end();
});

/**
 * The three context-validation checks inside RoleCompiler#compileGroup
 * (services/role-compiler.ts:229-278: required-dimension, whitelist,
 * breadth-vs-available) are unreachable through the seeded catalog — no
 * requirement in seed/data/roles.ts pins a context, because
 * CLOUD-DEPLOY-L3-001 was deliberately kept out of the SWE L3 composition.
 * That leaves them untested by anything the demo or seed exercises, so these
 * tests drive RoleCompiler directly against a scratch role/role-level. They
 * never touch the seeded composition, so readiness/frontier numbers and the
 * pinned demo lines are unaffected.
 */

/**
 * A teardown failure inside a `finally` block replaces whatever error the
 * `try` block threw (standard JS finally-throw-replaces-try-throw semantics)
 * — so a cleanup that fails after a real assertion failure would silently
 * swap the useful error for an unrelated one. Route cleanup through this so
 * the test's actual failure always surfaces.
 */
async function safeCleanup(fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    console.error("cleanup failed (masking would have hidden the real assertion result):", err);
  }
}

async function createScratchRoleLevel(label: string): Promise<{
  roleLevelId: string;
  cleanup: () => Promise<void>;
}> {
  const [role] = await db
    .insert(s.role)
    .values({
      canonicalCode: `scratch-${label}-${crypto.randomUUID()}`,
      name: `Scratch role (${label})`,
    })
    .returning({ id: s.role.id });
  if (!role) throw new Error("failed to create scratch role");

  const [roleLevel] = await db
    .insert(s.roleLevel)
    .values({ roleId: role.id, level: 1, canonicalTitle: `Scratch (${label}) L1` })
    .returning({ id: s.roleLevel.id });
  if (!roleLevel) throw new Error("failed to create scratch role level");

  return {
    roleLevelId: roleLevel.id,
    // Everything compileAndPublish creates here stays in 'draft' status (it
    // never reaches the final publish step, because every test throws first),
    // so it isn't governed by the published-immutability trigger and can be
    // deleted outright, deepest-first.
    cleanup: async () => {
      const revisions = await db
        .select({ id: s.roleLevelRevision.id })
        .from(s.roleLevelRevision)
        .where(eq(s.roleLevelRevision.roleLevelId, roleLevel.id));
      for (const { id: revisionId } of revisions) {
        const groups = await db
          .select({ id: s.requirementGroup.id })
          .from(s.requirementGroup)
          .where(eq(s.requirementGroup.roleLevelRevisionId, revisionId));
        for (const { id: groupId } of groups) {
          const requirements = await db
            .select({ id: s.objectiveRequirement.id })
            .from(s.objectiveRequirement)
            .where(eq(s.objectiveRequirement.requirementGroupId, groupId));
          for (const { id: requirementId } of requirements) {
            await db
              .delete(s.objectiveRequirementContext)
              .where(eq(s.objectiveRequirementContext.objectiveRequirementId, requirementId));
          }
          await db
            .delete(s.objectiveRequirement)
            .where(eq(s.objectiveRequirement.requirementGroupId, groupId));
        }
        await db
          .delete(s.requirementGroup)
          .where(eq(s.requirementGroup.roleLevelRevisionId, revisionId));
      }
      await db.delete(s.roleLevelRevision).where(eq(s.roleLevelRevision.roleLevelId, roleLevel.id));
      await db.delete(s.roleLevel).where(eq(s.roleLevel.id, roleLevel.id));
      await db.delete(s.role).where(eq(s.role.id, role.id));
    },
  };
}

test("a role requirement pinning a dimension the objective does not declare required is rejected", async () => {
  const frameworkReleaseId = await releaseId(db);
  const { roleLevelId, cleanup } = await createScratchRoleLevel("no-policy");
  try {
    await expect(
      new RoleCompiler(db).compileAndPublish({
        roleLevelId,
        frameworkReleaseId,
        version: "0.0.1",
        title: "Scratch",
        description: "",
        groups: [
          {
            label: "Test Group",
            operator: "all_of",
            members: [
              {
                kind: "objective",
                // NET-TCP-L1-001 declares no context policy at all.
                objectiveCode: "NET-TCP-L1-001",
                policy: { contexts: [{ dimensionCode: "cloud_provider" }] },
              },
            ],
          },
        ],
      }),
    ).rejects.toThrow(/does not declare it required/);
  } finally {
    await safeCleanup(cleanup);
  }
});

test("a role requirement pinning a value outside the objective's allowed-value whitelist is rejected", async () => {
  const frameworkReleaseId = await releaseId(db);
  const target = await objectiveId(db, "CLOUD-DEPLOY-L3-001");
  const azureValueId = await findContextValueId(db, "cloud_provider", "azure");

  // CLOUD-DEPLOY-L3-001 ships with no whitelist (any permitted value passes).
  // Add one here, scoped to this test, so the whitelist-rejection branch has
  // something to reject against.
  await db.insert(s.objectiveContextAllowedValue).values({
    objectiveRevisionId: target,
    dimensionCode: "cloud_provider",
    contextValueId: azureValueId,
  });

  const { roleLevelId, cleanup } = await createScratchRoleLevel("whitelist");
  try {
    await expect(
      new RoleCompiler(db).compileAndPublish({
        roleLevelId,
        frameworkReleaseId,
        version: "0.0.1",
        title: "Scratch",
        description: "",
        groups: [
          {
            label: "Test Group",
            operator: "all_of",
            members: [
              {
                kind: "objective",
                objectiveCode: "CLOUD-DEPLOY-L3-001",
                // Pin "aws", but the whitelist just installed only permits azure.
                policy: { contexts: [{ dimensionCode: "cloud_provider", valueCode: "aws" }] },
              },
            ],
          },
        ],
      }),
    ).rejects.toThrow(/allowed-value whitelist does not permit/);
  } finally {
    await safeCleanup(cleanup);
    await safeCleanup(() =>
      db
        .delete(s.objectiveContextAllowedValue)
        .where(
          and(
            eq(s.objectiveContextAllowedValue.objectiveRevisionId, target),
            eq(s.objectiveContextAllowedValue.dimensionCode, "cloud_provider"),
          ),
        )
        .then(() => undefined),
    );
  }
});

test("a role requirement demanding more distinct values than the dimension has is rejected", async () => {
  const frameworkReleaseId = await releaseId(db);
  const { roleLevelId, cleanup } = await createScratchRoleLevel("breadth");
  try {
    await expect(
      new RoleCompiler(db).compileAndPublish({
        roleLevelId,
        frameworkReleaseId,
        version: "0.0.1",
        title: "Scratch",
        description: "",
        groups: [
          {
            label: "Test Group",
            operator: "all_of",
            members: [
              {
                kind: "objective",
                objectiveCode: "CLOUD-DEPLOY-L3-001",
                // cloud_provider has 4 seeded values (aws, azure, gcp,
                // aws_govcloud) — demanding 100 distinct values cannot be met.
                policy: {
                  contexts: [{ dimensionCode: "cloud_provider", minimumDistinctValues: 100 }],
                },
              },
            ],
          },
        ],
      }),
    ).rejects.toThrow(/demands 100 distinct cloud_provider values, but the dimension has fewer/);
  } finally {
    await safeCleanup(cleanup);
  }
});
