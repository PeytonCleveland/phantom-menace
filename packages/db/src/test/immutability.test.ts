import { sql } from "drizzle-orm";
import { afterAll, expect, test } from "vitest";
import * as s from "../schema/index";
import { findContextValueId } from "../services/context";
import {
  createDraftObjectiveFixture,
  createLearner,
  expectRejectionMatching,
  objectiveId,
  releaseId,
  withDb,
} from "./helpers";

/**
 * Task 12: immutability surface for the child rows this pass introduced.
 *
 * `enforce_objective_revision_immutability` (0001) freezes only the PARENT
 * row of a published objective revision. Every child table this pass added
 * (criteria, context policies, claim-evidence constraints, implication
 * criteria, task-variant contexts, criterion mappings, requirement contexts,
 * and context-value semantics) is otherwise mutable after publication, which
 * would let a later edit retroactively change what already-recorded evidence
 * meant. 0012 closes that gap; this file proves each trigger.
 */

const { db, pool } = withDb();
afterAll(async () => {
  await pool.end();
});

// ---------------------------------------------------------------------------
// catalog.objective_criterion — frozen once its objective revision belongs to
// a published (or retired) framework release. Covers INSERT too: adding a
// criterion after publication changes what the revision claims exactly as
// much as editing one.
// ---------------------------------------------------------------------------

test("criteria of a published objective revision are frozen against UPDATE", async () => {
  await expectRejectionMatching(
    db.execute(sql`
      UPDATE catalog.objective_criterion c
      SET statement = 'tampered'
      FROM catalog.learning_objective_revision lor
      JOIN catalog.learning_objective lo ON lo.id = lor.learning_objective_id
      WHERE c.objective_revision_id = lor.id AND lo.canonical_code = 'RUST-NET-L3-001'
    `),
    /published.*frozen/i,
  );
});

test("criteria of a published objective revision are frozen against DELETE", async () => {
  await expectRejectionMatching(
    db.execute(sql`
      DELETE FROM catalog.objective_criterion c
      USING catalog.learning_objective_revision lor, catalog.learning_objective lo
      WHERE c.objective_revision_id = lor.id
        AND lo.id = lor.learning_objective_id
        AND lo.canonical_code = 'RUST-NET-L3-001'
    `),
    /published.*frozen/i,
  );
});

test("a new criterion cannot be inserted onto a published objective revision", async () => {
  const objectiveRevisionId = await objectiveId(db, "RUST-NET-L3-001");
  await expectRejectionMatching(
    db.insert(s.objectiveCriterion).values({
      objectiveRevisionId,
      code: "sneaked-in",
      statement: "Should never land.",
      kind: "success",
    }),
    /published.*frozen/i,
  );
});

test("a criterion cannot be re-parented off a published objective revision, even onto a draft one", async () => {
  // The parent-keyed freeze functions must reject based on the OLD parent,
  // not just NEW: checking only NEW would let an UPDATE silently detach a
  // row from a frozen parent onto an unfrozen one — the exact retroactive
  // change 0012 exists to prevent — without ever raising.
  const fixture = await createDraftObjectiveFixture(db, "criterion-reparent-escape", {
    title: "Scratch re-parent target",
    statement: "Exists only to be an unpublished re-parent target.",
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
  });
  try {
    const rustL3RevisionId = await objectiveId(db, "RUST-NET-L3-001");
    await expectRejectionMatching(
      db.execute(sql`
        UPDATE catalog.objective_criterion
        SET objective_revision_id = ${fixture.objectiveRevisionId}
        WHERE objective_revision_id = ${rustL3RevisionId} AND code = 'preserve-incomplete-data'
      `),
      /published.*frozen/i,
    );
    const stillAttached = await db.execute(sql`
      SELECT 1 FROM catalog.objective_criterion
      WHERE objective_revision_id = ${rustL3RevisionId} AND code = 'preserve-incomplete-data'
    `);
    expect(stillAttached.rows).toHaveLength(1);
  } finally {
    await fixture.cleanup();
  }
});

// ---------------------------------------------------------------------------
// catalog.objective_context_policy / objective_context_allowed_value —
// same freeze, also covering INSERT.
// ---------------------------------------------------------------------------

test("a context policy cannot be inserted onto a published objective revision", async () => {
  const objectiveRevisionId = await objectiveId(db, "CLOUD-DEPLOY-L3-001");
  await expectRejectionMatching(
    db.insert(s.objectiveContextPolicy).values({
      objectiveRevisionId,
      dimensionCode: "programming_language",
      policy: "optional",
    }),
    /published.*frozen/i,
  );
});

test("a published objective revision's existing context policy cannot be deleted", async () => {
  const objectiveRevisionId = await objectiveId(db, "CLOUD-DEPLOY-L3-001");
  await expectRejectionMatching(
    db
      .delete(s.objectiveContextPolicy)
      .where(
        sql`objective_revision_id = ${objectiveRevisionId} AND dimension_code = 'cloud_provider'`,
      ),
    /published.*frozen/i,
  );
});

test("an allowed-value whitelist entry cannot be inserted onto a published objective revision", async () => {
  const objectiveRevisionId = await objectiveId(db, "CLOUD-DEPLOY-L3-001");
  const awsValueId = await findContextValueId(db, "cloud_provider", "aws");
  await expectRejectionMatching(
    db.insert(s.objectiveContextAllowedValue).values({
      objectiveRevisionId,
      dimensionCode: "cloud_provider",
      contextValueId: awsValueId,
    }),
    /published.*frozen/i,
  );
});

// ---------------------------------------------------------------------------
// catalog.objective_claim_evidence_constraint — same freeze.
// ---------------------------------------------------------------------------

test("a published objective revision's claim-evidence constraint cannot be updated", async () => {
  const objectiveRevisionId = await objectiveId(db, "RUST-NET-L3-001");
  await expectRejectionMatching(
    db
      .update(s.objectiveClaimEvidenceConstraint)
      .set({ practicalPerformanceRequired: false })
      .where(sql`objective_revision_id = ${objectiveRevisionId}`),
    /published.*frozen/i,
  );
});

// ---------------------------------------------------------------------------
// catalog.objective_evidence_implication_criterion — frozen once the owning
// implication belongs to a published release. UPDATE/DELETE only: creation
// happens through createEvidenceImplication before publication.
// ---------------------------------------------------------------------------

async function implicationCriterionRef(): Promise<{ implicationId: string; criterionId: string }> {
  const result = await db.execute(sql`
    SELECT oeic.implication_id, oeic.objective_criterion_id
    FROM catalog.objective_evidence_implication_criterion oeic
    JOIN catalog.objective_evidence_implication i ON i.id = oeic.implication_id
    JOIN catalog.learning_objective_revision src ON src.id = i.source_objective_revision_id
    JOIN catalog.learning_objective slo ON slo.id = src.learning_objective_id
    JOIN catalog.objective_criterion c ON c.id = oeic.objective_criterion_id
    WHERE slo.canonical_code = 'RUST-NET-L3-001' AND c.code = 'preserve-incomplete-data'
  `);
  const row = result.rows[0];
  if (typeof row?.implication_id !== "string" || typeof row?.objective_criterion_id !== "string") {
    throw new Error("expected seeded implication criterion not found");
  }
  return { implicationId: row.implication_id, criterionId: row.objective_criterion_id };
}

test("a published release's implication criterion cannot be deleted", async () => {
  const { implicationId, criterionId } = await implicationCriterionRef();
  await expectRejectionMatching(
    db
      .delete(s.objectiveEvidenceImplicationCriterion)
      .where(sql`implication_id = ${implicationId} AND objective_criterion_id = ${criterionId}`),
    /published.*frozen/i,
  );
});

// ---------------------------------------------------------------------------
// assessment.task_variant_context / observable_criterion_mapping — a task
// revision has no published state of its own; these freeze once a learner
// attempt exists under the owning task revision. INSERT is covered too:
// mapping a criterion (or a context) onto something after attempts already
// exist would make an already-recorded observation retroactively satisfy an
// extra criterion, or be scoped to a context it was never evaluated against.
//
// These pick TASK-RUST-FRAMING-CHALLENGE-01's *qualification*-mode
// administration specifically (not just LIMIT 1 on whatever administration
// joins first): ceiling.test.ts permanently attaches a learner_attempt to
// that task's *practice*-mode administration, so an unordered pick would
// intermittently land on an administration another file already claimed,
// making this file's own attempt-then-clean-up sequence order-dependent on
// file execution order.
// ---------------------------------------------------------------------------

async function seededTaskVariantAndAdministration(): Promise<{
  taskVariantId: string;
  administrationId: string;
}> {
  const result = await db.execute(sql`
    SELECT tv.id AS task_variant_id, ta.id AS administration_id
    FROM assessment.task_variant tv
    JOIN assessment.task_revision tr ON tr.id = tv.task_revision_id
    JOIN assessment.task_template tt ON tt.id = tr.task_template_id
    JOIN assessment.task_administration ta ON ta.task_variant_id = tv.id
    WHERE tt.canonical_code = 'TASK-RUST-FRAMING-CHALLENGE-01' AND ta.mode = 'qualification'
  `);
  const row = result.rows[0];
  if (typeof row?.task_variant_id !== "string" || typeof row?.administration_id !== "string") {
    throw new Error("expected seeded qualification-mode task variant/administration not found");
  }
  return { taskVariantId: row.task_variant_id, administrationId: row.administration_id };
}

// TASK-RUST-ASYNC-DIAGNOSIS-01 is never attempted anywhere in this suite —
// used below as an unattempted re-parent target, to prove a row cannot be
// silently detached from a frozen (attempted) parent onto an unfrozen one.
async function unattemptedTaskVariantId(): Promise<string> {
  const result = await db.execute(sql`
    SELECT tv.id AS task_variant_id
    FROM assessment.task_variant tv
    JOIN assessment.task_revision tr ON tr.id = tv.task_revision_id
    JOIN assessment.task_template tt ON tt.id = tr.task_template_id
    WHERE tt.canonical_code = 'TASK-RUST-ASYNC-DIAGNOSIS-01'
  `);
  const id = result.rows[0]?.task_variant_id;
  if (typeof id !== "string") throw new Error("expected seeded unattempted task variant not found");
  return id;
}

async function unattemptedObservableCriterionMappingRef(): Promise<{
  evidenceSpecObservableId: string;
  objectiveCriterionId: string;
}> {
  const result = await db.execute(sql`
    SELECT m.evidence_spec_observable_id, m.objective_criterion_id
    FROM assessment.observable_criterion_mapping m
    JOIN assessment.evidence_spec_observable obs ON obs.id = m.evidence_spec_observable_id
    JOIN assessment.task_objective_evidence_spec spec ON spec.id = obs.evidence_spec_id
    JOIN assessment.task_revision tr ON tr.id = spec.task_revision_id
    JOIN assessment.task_template tt ON tt.id = tr.task_template_id
    WHERE tt.canonical_code = 'TASK-RUST-ASYNC-DIAGNOSIS-01'
    LIMIT 1
  `);
  const row = result.rows[0];
  if (
    typeof row?.evidence_spec_observable_id !== "string" ||
    typeof row?.objective_criterion_id !== "string"
  ) {
    throw new Error("expected seeded unattempted observable_criterion_mapping row not found");
  }
  return {
    evidenceSpecObservableId: row.evidence_spec_observable_id,
    objectiveCriterionId: row.objective_criterion_id,
  };
}

test("task_variant_context freezes once the variant has a recorded attempt", async () => {
  const { taskVariantId, administrationId } = await seededTaskVariantAndAdministration();
  const rustValueId = await findContextValueId(db, "programming_language", "rust");
  const learnerId = await createLearner(db, "immutability-task-variant-context");

  // No attempt yet: insert is allowed.
  await db.insert(s.taskVariantContext).values({
    taskVariantId,
    dimensionCode: "programming_language",
    contextValueId: rustValueId,
  });

  const [attempt] = await db
    .insert(s.learnerAttempt)
    .values({ learnerId, taskAdministrationId: administrationId, attemptStatus: "completed" })
    .returning({ id: s.learnerAttempt.id });
  if (!attempt) throw new Error("failed to create attempt");

  try {
    await expectRejectionMatching(
      db
        .update(s.taskVariantContext)
        .set({ contextValueId: rustValueId })
        .where(sql`task_variant_id = ${taskVariantId} AND dimension_code = 'programming_language'`),
      /recorded attempts.*frozen/i,
    );
    await expectRejectionMatching(
      db
        .delete(s.taskVariantContext)
        .where(sql`task_variant_id = ${taskVariantId} AND dimension_code = 'programming_language'`),
      /recorded attempts.*frozen/i,
    );
    await expectRejectionMatching(
      db.insert(s.taskVariantContext).values({
        taskVariantId,
        dimensionCode: "cloud_provider",
        contextValueId: await findContextValueId(db, "cloud_provider", "aws"),
      }),
      /recorded attempts.*frozen/i,
    );
  } finally {
    // Delete the attempt first — the row itself stays frozen until it does.
    await db.delete(s.learnerAttempt).where(sql`id = ${attempt.id}`);
    await db
      .delete(s.taskVariantContext)
      .where(sql`task_variant_id = ${taskVariantId} AND dimension_code = 'programming_language'`);
  }
});

test("a task_variant_context row cannot be re-parented off an attempted variant, even onto an unattempted one", async () => {
  const { taskVariantId, administrationId } = await seededTaskVariantAndAdministration();
  const unattemptedVariantId = await unattemptedTaskVariantId();
  const rustValueId = await findContextValueId(db, "programming_language", "rust");
  const learnerId = await createLearner(db, "immutability-task-variant-context-reparent");

  await db.insert(s.taskVariantContext).values({
    taskVariantId,
    dimensionCode: "programming_language",
    contextValueId: rustValueId,
  });
  const [attempt] = await db
    .insert(s.learnerAttempt)
    .values({ learnerId, taskAdministrationId: administrationId, attemptStatus: "completed" })
    .returning({ id: s.learnerAttempt.id });
  if (!attempt) throw new Error("failed to create attempt");

  try {
    await expectRejectionMatching(
      db.execute(sql`
        UPDATE assessment.task_variant_context
        SET task_variant_id = ${unattemptedVariantId}
        WHERE task_variant_id = ${taskVariantId} AND dimension_code = 'programming_language'
      `),
      /recorded attempts.*frozen/i,
    );
  } finally {
    await db.delete(s.learnerAttempt).where(sql`id = ${attempt.id}`);
    await db
      .delete(s.taskVariantContext)
      .where(sql`task_variant_id = ${taskVariantId} AND dimension_code = 'programming_language'`);
  }
});

async function seededObservableCriterionMappingRef(): Promise<{
  evidenceSpecObservableId: string;
  objectiveCriterionId: string;
}> {
  const result = await db.execute(sql`
    SELECT m.evidence_spec_observable_id, m.objective_criterion_id
    FROM assessment.observable_criterion_mapping m
    JOIN assessment.evidence_spec_observable obs ON obs.id = m.evidence_spec_observable_id
    JOIN assessment.task_objective_evidence_spec spec ON spec.id = obs.evidence_spec_id
    JOIN assessment.task_revision tr ON tr.id = spec.task_revision_id
    JOIN assessment.task_template tt ON tt.id = tr.task_template_id
    WHERE tt.canonical_code = 'TASK-RUST-FRAMING-CHALLENGE-01'
    LIMIT 1
  `);
  const row = result.rows[0];
  if (
    typeof row?.evidence_spec_observable_id !== "string" ||
    typeof row?.objective_criterion_id !== "string"
  ) {
    throw new Error("expected seeded observable_criterion_mapping row not found");
  }
  return {
    evidenceSpecObservableId: row.evidence_spec_observable_id,
    objectiveCriterionId: row.objective_criterion_id,
  };
}

test("observable_criterion_mapping freezes once its task revision has a recorded attempt", async () => {
  const { taskVariantId: _tv, administrationId } = await seededTaskVariantAndAdministration();
  const { evidenceSpecObservableId, objectiveCriterionId } =
    await seededObservableCriterionMappingRef();
  const learnerId = await createLearner(db, "immutability-observable-mapping");

  const [attempt] = await db
    .insert(s.learnerAttempt)
    .values({ learnerId, taskAdministrationId: administrationId, attemptStatus: "completed" })
    .returning({ id: s.learnerAttempt.id });
  if (!attempt) throw new Error("failed to create attempt");

  try {
    await expectRejectionMatching(
      db
        .delete(s.observableCriterionMapping)
        .where(
          sql`evidence_spec_observable_id = ${evidenceSpecObservableId} AND objective_criterion_id = ${objectiveCriterionId}`,
        ),
      /recorded attempts.*frozen/i,
    );
    const otherCriterionRevisionId = await objectiveId(db, "RUST-NET-L3-001");
    const otherCriterion = await db.execute(sql`
      SELECT id FROM catalog.objective_criterion
      WHERE objective_revision_id = ${otherCriterionRevisionId} AND code = 'no-data-loss'
    `);
    const otherCriterionId = otherCriterion.rows[0]?.id;
    if (typeof otherCriterionId !== "string") throw new Error("expected criterion not found");
    await expectRejectionMatching(
      db.insert(s.observableCriterionMapping).values({
        evidenceSpecObservableId,
        objectiveCriterionId: otherCriterionId,
      }),
      /recorded attempts.*frozen/i,
    );
  } finally {
    await db.delete(s.learnerAttempt).where(sql`id = ${attempt.id}`);
  }
});

test("an observable_criterion_mapping cannot be re-parented off an attempted observable, even onto an unattempted one", async () => {
  const { administrationId } = await seededTaskVariantAndAdministration();
  const attempted = await seededObservableCriterionMappingRef();
  const unattempted = await unattemptedObservableCriterionMappingRef();
  const learnerId = await createLearner(db, "immutability-observable-mapping-reparent");

  const [attempt] = await db
    .insert(s.learnerAttempt)
    .values({ learnerId, taskAdministrationId: administrationId, attemptStatus: "completed" })
    .returning({ id: s.learnerAttempt.id });
  if (!attempt) throw new Error("failed to create attempt");

  try {
    await expectRejectionMatching(
      db.execute(sql`
        UPDATE assessment.observable_criterion_mapping
        SET evidence_spec_observable_id = ${unattempted.evidenceSpecObservableId}
        WHERE evidence_spec_observable_id = ${attempted.evidenceSpecObservableId}
          AND objective_criterion_id = ${attempted.objectiveCriterionId}
      `),
      /recorded attempts.*frozen/i,
    );
  } finally {
    await db.delete(s.learnerAttempt).where(sql`id = ${attempt.id}`);
  }
});

// ---------------------------------------------------------------------------
// qualification.objective_requirement_context — frozen with its published
// role level revision. No requirement in the seed pins a context, so this
// fixture builds its own scratch role/level/group/requirement. Once
// published it is permanent test-DB litter by design (like every other
// published-immutable row this pass creates) — the row cannot be deleted
// once the trigger it proves is doing its job.
// ---------------------------------------------------------------------------

test("a published role level revision's requirement context is frozen", async () => {
  const frameworkReleaseId = await releaseId(db);
  const objectiveRevisionId = await objectiveId(db, "NET-TCP-L1-001");
  const awsValueId = await findContextValueId(db, "cloud_provider", "aws");
  const suffix = crypto.randomUUID();

  const [role] = await db
    .insert(s.role)
    .values({ canonicalCode: `scratch-req-ctx-${suffix}`, name: "Scratch req-ctx role" })
    .returning({ id: s.role.id });
  if (!role) throw new Error("failed to create scratch role");

  const [roleLevel] = await db
    .insert(s.roleLevel)
    .values({ roleId: role.id, level: 1, canonicalTitle: `Scratch req-ctx L1` })
    .returning({ id: s.roleLevel.id });
  if (!roleLevel) throw new Error("failed to create scratch role level");

  const [revision] = await db
    .insert(s.roleLevelRevision)
    .values({
      roleLevelId: roleLevel.id,
      frameworkReleaseId,
      version: "0.0.1",
      title: "Scratch",
      description: "",
      status: "draft",
    })
    .returning({ id: s.roleLevelRevision.id });
  if (!revision) throw new Error("failed to create scratch role level revision");

  const [group] = await db
    .insert(s.requirementGroup)
    .values({ roleLevelRevisionId: revision.id, operator: "all_of", label: "Group" })
    .returning({ id: s.requirementGroup.id });
  if (!group) throw new Error("failed to create scratch requirement group");

  const [requirement] = await db
    .insert(s.objectiveRequirement)
    .values({
      requirementGroupId: group.id,
      objectiveRevisionId,
      requiredAssuranceClass: "B",
    })
    .returning({ id: s.objectiveRequirement.id });
  if (!requirement) throw new Error("failed to create scratch objective requirement");

  await db.insert(s.objectiveRequirementContext).values({
    objectiveRequirementId: requirement.id,
    dimensionCode: "cloud_provider",
    contextValueId: awsValueId,
    minimumDistinctValues: 1,
  });

  // Publish: freezes the requirement context via the trigger under test.
  await db
    .update(s.roleLevelRevision)
    .set({ status: "published", publishedAt: new Date() })
    .where(sql`id = ${revision.id}`);

  await expectRejectionMatching(
    db
      .update(s.objectiveRequirementContext)
      .set({ minimumDistinctValues: 2 })
      .where(sql`objective_requirement_id = ${requirement.id}`),
    /requirement contexts are frozen/i,
  );
  await expectRejectionMatching(
    db
      .delete(s.objectiveRequirementContext)
      .where(sql`objective_requirement_id = ${requirement.id}`),
    /requirement contexts are frozen/i,
  );

  // Re-parent escape: a second requirement group in a DRAFT (never
  // published) revision of the same scratch role level. Moving the frozen
  // context row onto it must still be rejected, based on the OLD
  // (published) requirement — not silently allowed just because the NEW
  // requirement's own revision isn't published.
  const [draftRevision] = await db
    .insert(s.roleLevelRevision)
    .values({
      roleLevelId: roleLevel.id,
      frameworkReleaseId,
      version: "0.0.2",
      title: "Scratch draft",
      description: "",
      status: "draft",
    })
    .returning({ id: s.roleLevelRevision.id });
  if (!draftRevision) throw new Error("failed to create draft scratch role level revision");
  const [draftGroup] = await db
    .insert(s.requirementGroup)
    .values({ roleLevelRevisionId: draftRevision.id, operator: "all_of", label: "Draft group" })
    .returning({ id: s.requirementGroup.id });
  if (!draftGroup) throw new Error("failed to create draft scratch requirement group");
  const [draftRequirement] = await db
    .insert(s.objectiveRequirement)
    .values({
      requirementGroupId: draftGroup.id,
      objectiveRevisionId,
      requiredAssuranceClass: "B",
    })
    .returning({ id: s.objectiveRequirement.id });
  if (!draftRequirement) throw new Error("failed to create draft scratch objective requirement");

  await expectRejectionMatching(
    db.execute(sql`
      UPDATE qualification.objective_requirement_context
      SET objective_requirement_id = ${draftRequirement.id}
      WHERE objective_requirement_id = ${requirement.id}
    `),
    /requirement contexts are frozen/i,
  );
});

// ---------------------------------------------------------------------------
// catalog.context_value — dimension_code, code, and parent_value_id freeze
// once referenced; name/description/active stay mutable throughout.
//
// The seed itself never references aws_govcloud from any of the five
// governed tables (only the demo scenario does, in the dev DB, not this
// test DB) — so testing the freeze against it as-seeded would be vacuous:
// the trigger's EXISTS check would find nothing and silently allow the
// mutation. Reference it here first, via a scratch task_variant_context row
// on a seeded task variant (cheapest of the five to set up and to tear
// down — it carries no attempt, so it is never itself frozen).
// ---------------------------------------------------------------------------

let referencedTaskVariantId: string;
let awsGovcloudId: string;

test("setup: reference aws_govcloud so the freeze below is non-vacuous", async () => {
  const { taskVariantId } = await seededTaskVariantAndAdministration();
  awsGovcloudId = await findContextValueId(db, "cloud_provider", "aws_govcloud");
  await db.insert(s.taskVariantContext).values({
    taskVariantId,
    dimensionCode: "cloud_provider",
    contextValueId: awsGovcloudId,
  });
  referencedTaskVariantId = taskVariantId;
});

test("a referenced context value's parent cannot be re-pointed", async () => {
  await expectRejectionMatching(
    db.execute(sql`
      UPDATE catalog.context_value SET parent_value_id = NULL WHERE code = 'aws_govcloud'
    `),
    /context value aws_govcloud is referenced/,
  );
});

test("a referenced context value's code cannot be renamed", async () => {
  await expectRejectionMatching(
    db.execute(sql`
      UPDATE catalog.context_value SET code = 'aws_govcloud_renamed' WHERE code = 'aws_govcloud'
    `),
    /context value aws_govcloud is referenced/,
  );
});

test("a referenced context value's name and description remain mutable", async () => {
  const before = await db.execute(sql`
    SELECT name, description FROM catalog.context_value WHERE code = 'aws_govcloud'
  `);
  const beforeName = before.rows[0]?.name;
  const beforeDescription = before.rows[0]?.description;
  if (typeof beforeName !== "string" || typeof beforeDescription !== "string") {
    throw new Error("aws_govcloud not found");
  }

  await db.execute(sql`
    UPDATE catalog.context_value
    SET name = 'AWS GovCloud (US) — renamed', description = 'updated description'
    WHERE code = 'aws_govcloud'
  `);
  const after = await db.execute(sql`
    SELECT name, description FROM catalog.context_value WHERE code = 'aws_govcloud'
  `);
  expect(after.rows[0]?.name).not.toBe(beforeName);
  expect(after.rows[0]?.description).toBe("updated description");

  // Restore both fields, so later tests (and the demo) see the seeded
  // name/description — not just the name, as this used to.
  await db.execute(sql`
    UPDATE catalog.context_value
    SET name = ${beforeName}, description = ${beforeDescription}
    WHERE code = 'aws_govcloud'
  `);
});

test("teardown: unreference aws_govcloud", async () => {
  await db
    .delete(s.taskVariantContext)
    .where(sql`task_variant_id = ${referencedTaskVariantId} AND dimension_code = 'cloud_provider'`);
  const stillReferenced = await db.execute(sql`
    SELECT 1 FROM assessment.task_variant_context WHERE context_value_id = ${awsGovcloudId}
  `);
  expect(stillReferenced.rows).toHaveLength(0);
});

test("an unreferenced context value's identity fields remain mutable", async () => {
  const suffix = crypto.randomUUID();
  const dim = `t12_scratch_dim_${suffix}`;
  await db.insert(s.contextDimension).values({ code: dim, name: "Scratch dimension" });
  const [value] = await db
    .insert(s.contextValue)
    .values({ dimensionCode: dim, code: "before_code", name: "Scratch value" })
    .returning({ id: s.contextValue.id });
  if (!value) throw new Error("failed to create scratch context value");

  try {
    // Unreferenced: renaming its code is fine.
    await db.update(s.contextValue).set({ code: "after_code" }).where(sql`id = ${value.id}`);
    const result = await db.execute(
      sql`SELECT code FROM catalog.context_value WHERE id = ${value.id}`,
    );
    expect(result.rows[0]?.code).toBe("after_code");
  } finally {
    await db.delete(s.contextValue).where(sql`id = ${value.id}`);
    await db.delete(s.contextDimension).where(sql`code = ${dim}`);
  }
});
