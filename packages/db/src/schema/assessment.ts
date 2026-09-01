import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { frameworkRelease, learningObjectiveRevision, objectiveCriterion } from "./catalog";
import { contextDimension, contextValue } from "./context";
import {
  administrationModeEnum,
  assessmentSchema,
  claimRoleEnum,
  evidenceStrengthEnum,
  performanceScopeEnum,
  taskKindEnum,
  transferDistanceEnum,
} from "./enums";
import { profile } from "./learner";

// ---------------------------------------------------------------------------
// Rubrics (§12.14)
// ---------------------------------------------------------------------------

export const rubric = assessmentSchema.table("rubric", {
  id: uuid("id").primaryKey().defaultRandom(),
  canonicalCode: text("canonical_code").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const rubricRevision = assessmentSchema.table(
  "rubric_revision",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    rubricId: uuid("rubric_id")
      .notNull()
      .references(() => rubric.id),
    revisionNo: integer("revision_no").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("uq_rubric_revision_no").on(t.rubricId, t.revisionNo),
    check("ck_rubric_revision_no_positive", sql`revision_no > 0`),
  ],
);

export const rubricCriterion = assessmentSchema.table(
  "rubric_criterion",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    rubricRevisionId: uuid("rubric_revision_id")
      .notNull()
      .references(() => rubricRevision.id),
    code: text("code").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    weight: numeric("weight", { precision: 6, scale: 5 }).notNull().default("0"),
    critical: boolean("critical").notNull().default(false),
    levelAnchors: jsonb("level_anchors").notNull().default(sql`'{}'::jsonb`),
  },
  (t) => [
    unique("uq_rubric_criterion_code").on(t.rubricRevisionId, t.code),
    check("ck_rubric_criterion_weight", sql`weight BETWEEN 0 AND 1`),
  ],
);

// ---------------------------------------------------------------------------
// Tasks and evidence specifications (§12.15)
// ---------------------------------------------------------------------------

export const taskTemplate = assessmentSchema.table("task_template", {
  id: uuid("id").primaryKey().defaultRandom(),
  canonicalCode: text("canonical_code").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const taskRevision = assessmentSchema.table(
  "task_revision",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskTemplateId: uuid("task_template_id")
      .notNull()
      .references(() => taskTemplate.id),
    revisionNo: integer("revision_no").notNull(),
    frameworkReleaseId: uuid("framework_release_id")
      .notNull()
      .references(() => frameworkRelease.id),
    title: text("title").notNull(),
    taskKind: taskKindEnum("task_kind").notNull(),
    scenario: text("scenario").notNull(),
    instructions: text("instructions").notNull().default(""),
    designEvidenceCeiling: smallint("design_evidence_ceiling").notNull(),
    estimatedMinutes: integer("estimated_minutes"),
    environmentConfig: jsonb("environment_config").notNull().default(sql`'{}'::jsonb`),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("uq_task_revision_no").on(t.taskTemplateId, t.revisionNo),
    check("ck_task_revision_no_positive", sql`revision_no > 0`),
    check("ck_task_design_evidence_ceiling", sql`design_evidence_ceiling BETWEEN 1 AND 5`),
    check("ck_task_estimated_minutes", sql`estimated_minutes IS NULL OR estimated_minutes >= 0`),
  ],
);

export const taskVariant = assessmentSchema.table(
  "task_variant",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskRevisionId: uuid("task_revision_id")
      .notNull()
      .references(() => taskRevision.id),
    code: text("code").notNull(),
    variantConfig: jsonb("variant_config").notNull().default(sql`'{}'::jsonb`),
    transferDistanceDefault: transferDistanceEnum("transfer_distance_default")
      .notNull()
      .default("same"),
    performanceScopeDefault: performanceScopeEnum("performance_scope_default")
      .notNull()
      .default("focused"),
    active: boolean("active").notNull().default(true),
  },
  (t) => [unique("uq_task_variant_code").on(t.taskRevisionId, t.code)],
);

export const taskVariantContext = assessmentSchema.table(
  "task_variant_context",
  {
    taskVariantId: uuid("task_variant_id")
      .notNull()
      .references(() => taskVariant.id),
    dimensionCode: text("dimension_code")
      .notNull()
      .references(() => contextDimension.code),
    // Composite FK below (not a plain reference to contextValue.id) so a row
    // cannot claim dimension `cloud_provider` while pointing at a value that
    // actually belongs to `azure_region`.
    contextValueId: uuid("context_value_id").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.taskVariantId, t.dimensionCode] }),
    foreignKey({
      name: "fk_task_variant_context_value_dimension",
      columns: [t.contextValueId, t.dimensionCode],
      foreignColumns: [contextValue.id, contextValue.dimensionCode],
    }),
  ],
);

export const taskObjectiveEvidenceSpec = assessmentSchema.table(
  "task_objective_evidence_spec",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskRevisionId: uuid("task_revision_id")
      .notNull()
      .references(() => taskRevision.id),
    objectiveRevisionId: uuid("objective_revision_id")
      .notNull()
      .references(() => learningObjectiveRevision.id),
    claimRole: claimRoleEnum("claim_role").notNull(),
    evidenceStrength: evidenceStrengthEnum("evidence_strength").notNull(),
    minimumIndependence: smallint("minimum_independence").notNull(),
    minimumTransferDistance: transferDistanceEnum("minimum_transfer_distance").notNull(),
    minimumPerformanceScope: performanceScopeEnum("minimum_performance_scope").notNull(),
    rubricRevisionId: uuid("rubric_revision_id").references(() => rubricRevision.id),
    proxyPropagationAllowed: boolean("proxy_propagation_allowed").notNull().default(true),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
  },
  (t) => [
    unique("uq_task_objective_evidence_spec").on(t.taskRevisionId, t.objectiveRevisionId),
    check("ck_evidence_spec_min_independence", sql`minimum_independence BETWEEN 0 AND 4`),
    index("ix_evidence_spec_objective").on(t.objectiveRevisionId),
  ],
);

export const evidenceSpecObservable = assessmentSchema.table(
  "evidence_spec_observable",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    evidenceSpecId: uuid("evidence_spec_id")
      .notNull()
      .references(() => taskObjectiveEvidenceSpec.id),
    code: text("code").notNull(),
    statement: text("statement").notNull(),
    observableType: text("observable_type").notNull(),
    sortOrder: integer("sort_order"),
  },
  (t) => [
    unique("uq_evidence_spec_observable_code").on(t.evidenceSpecId, t.code),
    check(
      "ck_observable_type",
      sql`observable_type IN ('behavior', 'product', 'outcome', 'process', 'explanation', 'judgment')`,
    ),
  ],
);

// Many-to-many on purpose. One hidden executable test can establish several
// criteria at once, and one criterion can be established by several
// independent observables — an automated check plus a human rubric item.
export const observableCriterionMapping = assessmentSchema.table(
  "observable_criterion_mapping",
  {
    evidenceSpecObservableId: uuid("evidence_spec_observable_id")
      .notNull()
      .references(() => evidenceSpecObservable.id),
    objectiveCriterionId: uuid("objective_criterion_id")
      .notNull()
      .references(() => objectiveCriterion.id),
  },
  (t) => [primaryKey({ columns: [t.evidenceSpecObservableId, t.objectiveCriterionId] })],
);

// ---------------------------------------------------------------------------
// Task administrations and attempts (§12.16)
// ---------------------------------------------------------------------------

export const taskAdministration = assessmentSchema.table(
  "task_administration",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskVariantId: uuid("task_variant_id")
      .notNull()
      .references(() => taskVariant.id),
    mode: administrationModeEnum("mode").notNull(),
    assistancePolicy: jsonb("assistance_policy").notNull().default(sql`'{}'::jsonb`),
    timeLimitMinutes: integer("time_limit_minutes"),
    processCaptureEnabled: boolean("process_capture_enabled").notNull().default(false),
    // The ceiling given the assistance PERMITTED by this administration, not
    // the assistance actually consumed. A practice run with hints available
    // carries the reduced ceiling even if the learner never opens a hint.
    effectiveEvidenceCeiling: smallint("effective_evidence_ceiling").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  () => [
    check(
      "ck_administration_time_limit",
      sql`time_limit_minutes IS NULL OR time_limit_minutes > 0`,
    ),
    check("ck_administration_effective_ceiling", sql`effective_evidence_ceiling BETWEEN 1 AND 5`),
  ],
);

export const learnerAttempt = assessmentSchema.table(
  "learner_attempt",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    learnerId: uuid("learner_id")
      .notNull()
      .references(() => profile.id),
    taskAdministrationId: uuid("task_administration_id")
      .notNull()
      .references(() => taskAdministration.id),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    attemptStatus: text("attempt_status").notNull(),
    resultSummary: jsonb("result_summary").notNull().default(sql`'{}'::jsonb`),
  },
  (t) => [
    check(
      "ck_attempt_status",
      sql`attempt_status IN ('started', 'submitted', 'completed', 'abandoned', 'invalidated')`,
    ),
    index("ix_attempt_learner_started").on(t.learnerId, t.startedAt.desc()),
  ],
);
