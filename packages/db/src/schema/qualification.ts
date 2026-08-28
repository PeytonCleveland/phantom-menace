import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  integer,
  interval,
  jsonb,
  numeric,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { taskRevision } from "./assessment";
import { capabilitySetRevision, frameworkRelease, learningObjectiveRevision } from "./catalog";
import { contextDimension, contextValue } from "./context";
import {
  observationResultEnum,
  performanceScopeEnum,
  publicationStatusEnum,
  qualificationSchema,
  requirementOperatorEnum,
  transferDistanceEnum,
} from "./enums";
import { profile } from "./learner";

// ---------------------------------------------------------------------------
// Roles and role levels (§12.19)
// ---------------------------------------------------------------------------

export const role = qualificationSchema.table("role", {
  id: uuid("id").primaryKey().defaultRandom(),
  canonicalCode: text("canonical_code").notNull().unique(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const roleLevel = qualificationSchema.table(
  "role_level",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    roleId: uuid("role_id")
      .notNull()
      .references(() => role.id),
    level: smallint("level").notNull(),
    canonicalTitle: text("canonical_title").notNull(),
  },
  (t) => [
    unique("uq_role_level").on(t.roleId, t.level),
    check("ck_role_level_range", sql`level BETWEEN 1 AND 5`),
  ],
);

export const roleLevelRevision = qualificationSchema.table(
  "role_level_revision",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    roleLevelId: uuid("role_level_id")
      .notNull()
      .references(() => roleLevel.id),
    frameworkReleaseId: uuid("framework_release_id")
      .notNull()
      .references(() => frameworkRelease.id),
    version: text("version").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    status: publicationStatusEnum("status").notNull().default("draft"),
    extendsRoleLevelRevisionId: uuid("extends_role_level_revision_id").references(
      (): AnyPgColumn => roleLevelRevision.id,
    ),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
  },
  (t) => [unique("uq_role_level_revision_version").on(t.roleLevelId, t.version)],
);

// ---------------------------------------------------------------------------
// Requirement expression tree (§12.19)
// Same-revision parent constraint enforced by trigger.
// ---------------------------------------------------------------------------

export const requirementGroup = qualificationSchema.table(
  "requirement_group",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    roleLevelRevisionId: uuid("role_level_revision_id")
      .notNull()
      .references(() => roleLevelRevision.id),
    parentGroupId: uuid("parent_group_id").references((): AnyPgColumn => requirementGroup.id),
    operator: requirementOperatorEnum("operator").notNull(),
    minimumCount: integer("minimum_count"),
    label: text("label"),
    sortOrder: integer("sort_order"),
  },
  () => [
    check(
      "ck_requirement_group_n_of",
      sql`(operator = 'n_of' AND minimum_count IS NOT NULL AND minimum_count > 0) OR (operator <> 'n_of' AND minimum_count IS NULL)`,
    ),
  ],
);

export const objectiveRequirement = qualificationSchema.table(
  "objective_requirement",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requirementGroupId: uuid("requirement_group_id")
      .notNull()
      .references(() => requirementGroup.id),
    objectiveRevisionId: uuid("objective_revision_id")
      .notNull()
      .references(() => learningObjectiveRevision.id),
    sourceCapabilitySetRevisionId: uuid("source_capability_set_revision_id").references(
      () => capabilitySetRevision.id,
    ),
    directEvidenceRequired: boolean("direct_evidence_required").notNull().default(false),
    proxyEvidenceAllowed: boolean("proxy_evidence_allowed").notNull().default(true),
    minimumIndependence: smallint("minimum_independence"),
    minimumTransferDistance: transferDistanceEnum("minimum_transfer_distance"),
    minimumPerformanceScope: performanceScopeEnum("minimum_performance_scope"),
    maximumEvidenceAge: interval("maximum_evidence_age"),
  },
  (t) => [
    unique("uq_objective_requirement").on(t.requirementGroupId, t.objectiveRevisionId),
    check(
      "ck_objective_requirement_independence",
      sql`minimum_independence IS NULL OR minimum_independence BETWEEN 0 AND 4`,
    ),
  ],
);

export const objectiveRequirementContext = qualificationSchema.table(
  "objective_requirement_context",
  {
    objectiveRequirementId: uuid("objective_requirement_id")
      .notNull()
      .references(() => objectiveRequirement.id),
    dimensionCode: text("dimension_code")
      .notNull()
      .references(() => contextDimension.code),
    // Pin a value, or leave null and demand breadth. Never both.
    contextValueId: uuid("context_value_id").references(() => contextValue.id),
    minimumDistinctValues: integer("minimum_distinct_values").notNull().default(1),
  },
  (t) => [
    primaryKey({ columns: [t.objectiveRequirementId, t.dimensionCode] }),
    check(
      "ck_requirement_context_pin_or_breadth",
      sql`context_value_id IS NULL OR minimum_distinct_values = 1`,
    ),
    check("ck_requirement_context_minimum", sql`minimum_distinct_values >= 1`),
  ],
);

export const taskRequirement = qualificationSchema.table(
  "task_requirement",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requirementGroupId: uuid("requirement_group_id")
      .notNull()
      .references(() => requirementGroup.id),
    taskRevisionId: uuid("task_revision_id")
      .notNull()
      .references(() => taskRevision.id),
    minimumResult: observationResultEnum("minimum_result").notNull().default("successful"),
  },
  (t) => [unique("uq_task_requirement").on(t.requirementGroupId, t.taskRevisionId)],
);

// ---------------------------------------------------------------------------
// Learner role state projection (§12.20)
// ---------------------------------------------------------------------------

export const learnerRoleState = qualificationSchema.table(
  "learner_role_state",
  {
    learnerId: uuid("learner_id")
      .notNull()
      .references(() => profile.id),
    roleLevelRevisionId: uuid("role_level_revision_id")
      .notNull()
      .references(() => roleLevelRevision.id),
    state: text("state").notNull(),
    readinessScore: numeric("readiness_score", { precision: 6, scale: 5 }),
    requirementsMet: integer("requirements_met").notNull().default(0),
    requirementsTotal: integer("requirements_total").notNull().default(0),
    blockers: jsonb("blockers").notNull().default(sql`'[]'::jsonb`),
    calculatedAt: timestamp("calculated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.learnerId, t.roleLevelRevisionId] }),
    check(
      "ck_learner_role_state",
      sql`state IN ('not_started', 'in_progress', 'ready_for_review', 'qualified', 'stale', 'revoked')`,
    ),
    check(
      "ck_learner_role_readiness",
      sql`readiness_score IS NULL OR readiness_score BETWEEN 0 AND 1`,
    ),
  ],
);
