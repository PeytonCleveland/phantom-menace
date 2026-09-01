import { sql } from "drizzle-orm";
import {
  boolean,
  char,
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
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { contextDimension, contextValue } from "./context";
import {
  assertionStateEnum,
  catalogSchema,
  competencyRelationshipTypeEnum,
  contextPolicyEnum,
  criterionKindEnum,
  evidenceImplicationTypeEnum,
  evidenceStrengthEnum,
  membershipRoleEnum,
  objectiveRelationshipTypeEnum,
  publicationStatusEnum,
  relationshipProvenanceEnum,
  relationshipStrengthEnum,
  validationStatusEnum,
} from "./enums";

// ---------------------------------------------------------------------------
// Framework and releases (§12.2)
// ---------------------------------------------------------------------------

export const framework = catalogSchema.table("framework", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const frameworkRelease = catalogSchema.table(
  "framework_release",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    frameworkId: uuid("framework_id")
      .notNull()
      .references(() => framework.id),
    version: text("version").notNull(),
    status: publicationStatusEnum("status").notNull().default("draft"),
    notes: text("notes").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
  },
  (t) => [
    unique("uq_framework_release_version").on(t.frameworkId, t.version),
    check(
      "ck_framework_release_published_at",
      sql`(status = 'published' AND published_at IS NOT NULL) OR status <> 'published'`,
    ),
  ],
);

// ---------------------------------------------------------------------------
// Controlled verbs (§12.3)
// ---------------------------------------------------------------------------

export const verbDefinition = catalogSchema.table(
  "verb_definition",
  {
    code: text("code").primaryKey(),
    displayName: text("display_name").notNull(),
    definition: text("definition").notNull(),
    requiredElements: jsonb("required_elements").notNull().default(sql`'[]'::jsonb`),
    doesNotEstablish: jsonb("does_not_establish").notNull().default(sql`'[]'::jsonb`),
    defaultEvidenceChannels: jsonb("default_evidence_channels").notNull().default(sql`'[]'::jsonb`),
    allowedMasteryLevels: smallint("allowed_mastery_levels")
      .array()
      .notNull()
      .default(sql`ARRAY[1,2,3,4,5]::smallint[]`),
    active: boolean("active").notNull().default(true),
  },
  () => [
    check(
      "ck_verb_definition_allowed_levels",
      sql`allowed_mastery_levels <@ ARRAY[1,2,3,4,5]::smallint[]`,
    ),
  ],
);

// ---------------------------------------------------------------------------
// Domains (§12.4)
// ---------------------------------------------------------------------------

export const domain = catalogSchema.table("domain", {
  id: uuid("id").primaryKey().defaultRandom(),
  canonicalCode: text("canonical_code").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const domainRevision = catalogSchema.table(
  "domain_revision",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    domainId: uuid("domain_id")
      .notNull()
      .references(() => domain.id),
    revisionNo: integer("revision_no").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("uq_domain_revision_no").on(t.domainId, t.revisionNo),
    check("ck_domain_revision_no_positive", sql`revision_no > 0`),
  ],
);

export const frameworkReleaseDomain = catalogSchema.table(
  "framework_release_domain",
  {
    frameworkReleaseId: uuid("framework_release_id")
      .notNull()
      .references(() => frameworkRelease.id),
    domainRevisionId: uuid("domain_revision_id")
      .notNull()
      .references(() => domainRevision.id),
    sortOrder: integer("sort_order"),
  },
  (t) => [primaryKey({ columns: [t.frameworkReleaseId, t.domainRevisionId] })],
);

// ---------------------------------------------------------------------------
// Competencies (§12.5)
// ---------------------------------------------------------------------------

export const competency = catalogSchema.table("competency", {
  id: uuid("id").primaryKey().defaultRandom(),
  canonicalCode: text("canonical_code").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const competencyRevision = catalogSchema.table(
  "competency_revision",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    competencyId: uuid("competency_id")
      .notNull()
      .references(() => competency.id),
    revisionNo: integer("revision_no").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    outcomeStatement: text("outcome_statement").notNull().default(""),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("uq_competency_revision_no").on(t.competencyId, t.revisionNo),
    check("ck_competency_revision_no_positive", sql`revision_no > 0`),
  ],
);

export const frameworkReleaseCompetency = catalogSchema.table(
  "framework_release_competency",
  {
    frameworkReleaseId: uuid("framework_release_id")
      .notNull()
      .references(() => frameworkRelease.id),
    competencyRevisionId: uuid("competency_revision_id")
      .notNull()
      .references(() => competencyRevision.id),
  },
  (t) => [primaryKey({ columns: [t.frameworkReleaseId, t.competencyRevisionId] })],
);

export const domainCompetencyMembership = catalogSchema.table(
  "domain_competency_membership",
  {
    frameworkReleaseId: uuid("framework_release_id")
      .notNull()
      .references(() => frameworkRelease.id),
    domainRevisionId: uuid("domain_revision_id")
      .notNull()
      .references(() => domainRevision.id),
    competencyRevisionId: uuid("competency_revision_id")
      .notNull()
      .references(() => competencyRevision.id),
    membershipRole: membershipRoleEnum("membership_role").notNull(),
    sortOrder: integer("sort_order"),
  },
  (t) => [
    primaryKey({
      columns: [t.frameworkReleaseId, t.domainRevisionId, t.competencyRevisionId],
    }),
    uniqueIndex("uq_competency_primary_domain_per_release")
      .on(t.frameworkReleaseId, t.competencyRevisionId)
      .where(sql`membership_role = 'primary'`),
  ],
);

// ---------------------------------------------------------------------------
// Learning objectives (§12.6)
// ---------------------------------------------------------------------------

export const learningObjective = catalogSchema.table("learning_objective", {
  id: uuid("id").primaryKey().defaultRandom(),
  canonicalCode: text("canonical_code").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const learningObjectiveRevision = catalogSchema.table(
  "learning_objective_revision",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    learningObjectiveId: uuid("learning_objective_id")
      .notNull()
      .references(() => learningObjective.id),
    revisionNo: integer("revision_no").notNull(),
    title: text("title").notNull(),
    statement: text("statement").notNull(),
    masteryLevel: smallint("mastery_level").notNull(),
    verbCode: text("verb_code")
      .notNull()
      .references(() => verbDefinition.code),
    // Advisory. It seeds the initial value when authoring a role requirement
    // and governs nothing on its own — how much proof a qualification demands
    // lives on qualification.objective_requirement.required_assurance_class.
    // A = Lightweight, B = Performance, C = High Assurance.
    defaultAssuranceClass: char("default_assurance_class", { length: 1 }).notNull(),
    performanceObject: text("performance_object").notNull().default(""),
    conditions: jsonb("conditions").notNull().default(sql`'{}'::jsonb`),
    performanceModes: text("performance_modes").array().notNull().default(sql`ARRAY[]::text[]`),
    tags: text("tags").array().notNull().default(sql`ARRAY[]::text[]`),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("uq_objective_revision_no").on(t.learningObjectiveId, t.revisionNo),
    check("ck_objective_revision_no_positive", sql`revision_no > 0`),
    check("ck_objective_mastery_level", sql`mastery_level BETWEEN 1 AND 5`),
    check("ck_objective_default_assurance_class", sql`default_assurance_class IN ('A', 'B', 'C')`),
  ],
);

export const frameworkReleaseObjective = catalogSchema.table(
  "framework_release_objective",
  {
    frameworkReleaseId: uuid("framework_release_id")
      .notNull()
      .references(() => frameworkRelease.id),
    objectiveRevisionId: uuid("objective_revision_id")
      .notNull()
      .references(() => learningObjectiveRevision.id),
  },
  (t) => [primaryKey({ columns: [t.frameworkReleaseId, t.objectiveRevisionId] })],
);

export const objectiveContextPolicy = catalogSchema.table(
  "objective_context_policy",
  {
    objectiveRevisionId: uuid("objective_revision_id")
      .notNull()
      .references(() => learningObjectiveRevision.id),
    dimensionCode: text("dimension_code")
      .notNull()
      .references(() => contextDimension.code),
    policy: contextPolicyEnum("policy").notNull(),
  },
  (t) => [primaryKey({ columns: [t.objectiveRevisionId, t.dimensionCode] })],
);

export const objectiveContextAllowedValue = catalogSchema.table(
  "objective_context_allowed_value",
  {
    objectiveRevisionId: uuid("objective_revision_id")
      .notNull()
      .references(() => learningObjectiveRevision.id),
    dimensionCode: text("dimension_code").notNull(),
    contextValueId: uuid("context_value_id")
      .notNull()
      .references(() => contextValue.id),
  },
  (t) => [
    primaryKey({ columns: [t.objectiveRevisionId, t.dimensionCode, t.contextValueId] }),
    foreignKey({
      name: "fk_objective_context_allowed_policy",
      columns: [t.objectiveRevisionId, t.dimensionCode],
      foreignColumns: [
        objectiveContextPolicy.objectiveRevisionId,
        objectiveContextPolicy.dimensionCode,
      ],
    }),
  ],
);

// ---------------------------------------------------------------------------
// Objective criteria — the missing middle layer between a capability claim and
// the assessments that observe it.
//
// `code` is intended to stay stable within the objective's LINEAGE, not
// merely within the revision — that convention is what would let
// objective_revision_transition say "criteria unchanged -> evidence_carries_forward".
// `uq_objective_criterion_code` only enforces uniqueness within a single
// revision (objective_revision_id, code); lineage stability is an authoring
// convention this constraint does not enforce.
//
// A `critical_error` criterion is blocking by definition; there is no severity
// column, because a value the evaluator ignores is worse than no value at all.
// ---------------------------------------------------------------------------

export const objectiveCriterion = catalogSchema.table(
  "objective_criterion",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    objectiveRevisionId: uuid("objective_revision_id")
      .notNull()
      .references(() => learningObjectiveRevision.id),
    code: text("code").notNull(),
    statement: text("statement").notNull(),
    kind: criterionKindEnum("kind").notNull(),
    sortOrder: integer("sort_order"),
  },
  (t) => [unique("uq_objective_criterion_code").on(t.objectiveRevisionId, t.code)],
);

// Typed, not jsonb: these drive publication validation, which makes them core
// governing semantics rather than flexible metadata. They follow from the
// CLAIM — an `implement` objective inherently requires practical performance
// regardless of who is hiring.
export const objectiveClaimEvidenceConstraint = catalogSchema.table(
  "objective_claim_evidence_constraint",
  {
    objectiveRevisionId: uuid("objective_revision_id")
      .primaryKey()
      .references(() => learningObjectiveRevision.id),
    practicalPerformanceRequired: boolean("practical_performance_required").notNull(),
    constructedResponseSupported: boolean("constructed_response_supported").notNull(),
    multipleChoiceAloneSufficient: boolean("multiple_choice_alone_sufficient").notNull(),
    directObservationPossible: boolean("direct_observation_possible").notNull(),
  },
  () => [
    check(
      "ck_claim_constraint_coherent",
      sql`NOT (practical_performance_required AND multiple_choice_alone_sufficient)`,
    ),
  ],
);

export const competencyObjectiveMembership = catalogSchema.table(
  "competency_objective_membership",
  {
    frameworkReleaseId: uuid("framework_release_id")
      .notNull()
      .references(() => frameworkRelease.id),
    competencyRevisionId: uuid("competency_revision_id")
      .notNull()
      .references(() => competencyRevision.id),
    objectiveRevisionId: uuid("objective_revision_id")
      .notNull()
      .references(() => learningObjectiveRevision.id),
    membershipRole: membershipRoleEnum("membership_role").notNull(),
    sortOrder: integer("sort_order"),
  },
  (t) => [
    primaryKey({
      columns: [t.frameworkReleaseId, t.competencyRevisionId, t.objectiveRevisionId],
    }),
    uniqueIndex("uq_objective_primary_competency_per_release")
      .on(t.frameworkReleaseId, t.objectiveRevisionId)
      .where(sql`membership_role = 'primary'`),
  ],
);

// ---------------------------------------------------------------------------
// Objective revision compatibility (§12.7)
// ---------------------------------------------------------------------------

export const objectiveRevisionTransition = catalogSchema.table(
  "objective_revision_transition",
  {
    fromObjectiveRevisionId: uuid("from_objective_revision_id")
      .notNull()
      .references(() => learningObjectiveRevision.id),
    toObjectiveRevisionId: uuid("to_objective_revision_id")
      .notNull()
      .references(() => learningObjectiveRevision.id),
    compatibility: text("compatibility").notNull(),
    rationale: text("rationale").notNull(),
    approvedBy: text("approved_by"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
  },
  (t) => [
    primaryKey({ columns: [t.fromObjectiveRevisionId, t.toObjectiveRevisionId] }),
    check(
      "ck_transition_compatibility",
      sql`compatibility IN ('equivalent', 'evidence_carries_forward', 'requires_revalidation', 'incompatible')`,
    ),
    check("ck_transition_no_self", sql`from_objective_revision_id <> to_objective_revision_id`),
  ],
);

// ---------------------------------------------------------------------------
// Objective relationships (§12.9)
// ---------------------------------------------------------------------------

export const objectiveRelationship = catalogSchema.table(
  "objective_relationship",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    frameworkReleaseId: uuid("framework_release_id")
      .notNull()
      .references(() => frameworkRelease.id),
    sourceObjectiveRevisionId: uuid("source_objective_revision_id")
      .notNull()
      .references(() => learningObjectiveRevision.id),
    targetObjectiveRevisionId: uuid("target_objective_revision_id")
      .notNull()
      .references(() => learningObjectiveRevision.id),
    relationshipType: objectiveRelationshipTypeEnum("relationship_type").notNull(),
    strength: relationshipStrengthEnum("strength").notNull(),
    rationale: text("rationale").notNull(),
    context: jsonb("context").notNull().default(sql`'{}'::jsonb`),
    provenance: relationshipProvenanceEnum("provenance").notNull(),
    confidence: numeric("confidence", { precision: 4, scale: 3 }),
    validationStatus: validationStatusEnum("validation_status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("uq_objective_relationship").on(
      t.frameworkReleaseId,
      t.sourceObjectiveRevisionId,
      t.targetObjectiveRevisionId,
      t.relationshipType,
    ),
    check(
      "ck_objective_relationship_no_self",
      sql`source_objective_revision_id <> target_objective_revision_id`,
    ),
    check(
      "ck_objective_relationship_confidence",
      sql`confidence IS NULL OR confidence BETWEEN 0 AND 1`,
    ),
    index("ix_objective_relationship_source").on(t.frameworkReleaseId, t.sourceObjectiveRevisionId),
    index("ix_objective_relationship_target").on(t.frameworkReleaseId, t.targetObjectiveRevisionId),
  ],
);

// ---------------------------------------------------------------------------
// Competency relationships (§12.10)
// ---------------------------------------------------------------------------

export const competencyRelationship = catalogSchema.table(
  "competency_relationship",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    frameworkReleaseId: uuid("framework_release_id")
      .notNull()
      .references(() => frameworkRelease.id),
    sourceCompetencyRevisionId: uuid("source_competency_revision_id")
      .notNull()
      .references(() => competencyRevision.id),
    targetCompetencyRevisionId: uuid("target_competency_revision_id")
      .notNull()
      .references(() => competencyRevision.id),
    relationshipType: competencyRelationshipTypeEnum("relationship_type").notNull(),
    rationale: text("rationale").notNull(),
    provenance: relationshipProvenanceEnum("provenance").notNull(),
    confidence: numeric("confidence", { precision: 4, scale: 3 }),
    supportingObjectiveEdgeCount: integer("supporting_objective_edge_count").notNull().default(0),
    validationStatus: validationStatusEnum("validation_status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("uq_competency_relationship").on(
      t.frameworkReleaseId,
      t.sourceCompetencyRevisionId,
      t.targetCompetencyRevisionId,
      t.relationshipType,
    ),
    check(
      "ck_competency_relationship_no_self",
      sql`source_competency_revision_id <> target_competency_revision_id`,
    ),
    check(
      "ck_competency_relationship_confidence",
      sql`confidence IS NULL OR confidence BETWEEN 0 AND 1`,
    ),
    check("ck_competency_relationship_edge_count", sql`supporting_objective_edge_count >= 0`),
  ],
);

// ---------------------------------------------------------------------------
// Evidence implication (§12.11)
// Note: maximum_target_state is constrained to sensible propagation ceilings
// (developing | demonstrated), tighter than the raw spec DDL.
// ---------------------------------------------------------------------------

export const objectiveEvidenceImplication = catalogSchema.table(
  "objective_evidence_implication",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    frameworkReleaseId: uuid("framework_release_id")
      .notNull()
      .references(() => frameworkRelease.id),
    sourceObjectiveRevisionId: uuid("source_objective_revision_id")
      .notNull()
      .references(() => learningObjectiveRevision.id),
    targetObjectiveRevisionId: uuid("target_objective_revision_id")
      .notNull()
      .references(() => learningObjectiveRevision.id),
    implicationType: evidenceImplicationTypeEnum("implication_type").notNull(),
    derivedEvidenceStrength: evidenceStrengthEnum("derived_evidence_strength").notNull(),
    maximumTargetState: assertionStateEnum("maximum_target_state").notNull(),
    automatic: boolean("automatic").notNull().default(false),
    rationale: text("rationale").notNull(),
    validationStatus: validationStatusEnum("validation_status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("uq_objective_evidence_implication").on(
      t.frameworkReleaseId,
      t.sourceObjectiveRevisionId,
      t.targetObjectiveRevisionId,
      t.implicationType,
    ),
    check(
      "ck_evidence_implication_no_self",
      sql`source_objective_revision_id <> target_objective_revision_id`,
    ),
    check(
      "ck_evidence_implication_max_state",
      sql`maximum_target_state IN ('developing', 'demonstrated')`,
    ),
  ],
);

// Explicit, shortened constraint names below: the auto-generated names for
// this table's PK and FKs share a long common prefix that Postgres truncates
// to 63 bytes, which collided ("... already exists") under the default names.
export const objectiveEvidenceImplicationCriterion = catalogSchema.table(
  "objective_evidence_implication_criterion",
  {
    implicationId: uuid("implication_id").notNull(),
    objectiveCriterionId: uuid("objective_criterion_id").notNull(),
  },
  (t) => [
    primaryKey({
      name: "pk_evidence_implication_criterion",
      columns: [t.implicationId, t.objectiveCriterionId],
    }),
    foreignKey({
      name: "fk_evidence_implication_criterion_implication",
      columns: [t.implicationId],
      foreignColumns: [objectiveEvidenceImplication.id],
    }),
    foreignKey({
      name: "fk_evidence_implication_criterion_criterion",
      columns: [t.objectiveCriterionId],
      foreignColumns: [objectiveCriterion.id],
    }),
  ],
);

// ---------------------------------------------------------------------------
// Capability sets (§12.12)
// ---------------------------------------------------------------------------

export const capabilitySet = catalogSchema.table("capability_set", {
  id: uuid("id").primaryKey().defaultRandom(),
  canonicalCode: text("canonical_code").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const capabilitySetRevision = catalogSchema.table(
  "capability_set_revision",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    capabilitySetId: uuid("capability_set_id")
      .notNull()
      .references(() => capabilitySet.id),
    frameworkReleaseId: uuid("framework_release_id")
      .notNull()
      .references(() => frameworkRelease.id),
    revisionNo: integer("revision_no").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    status: publicationStatusEnum("status").notNull().default("draft"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
  },
  (t) => [
    unique("uq_capability_set_revision_no").on(t.capabilitySetId, t.revisionNo),
    check("ck_capability_set_revision_no_positive", sql`revision_no > 0`),
  ],
);

export const capabilitySetDomainMember = catalogSchema.table(
  "capability_set_domain_member",
  {
    capabilitySetRevisionId: uuid("capability_set_revision_id")
      .notNull()
      .references(() => capabilitySetRevision.id),
    domainRevisionId: uuid("domain_revision_id")
      .notNull()
      .references(() => domainRevision.id),
    selectionFilter: jsonb("selection_filter").notNull().default(sql`'{}'::jsonb`),
  },
  (t) => [primaryKey({ columns: [t.capabilitySetRevisionId, t.domainRevisionId] })],
);

export const capabilitySetCompetencyMember = catalogSchema.table(
  "capability_set_competency_member",
  {
    capabilitySetRevisionId: uuid("capability_set_revision_id")
      .notNull()
      .references(() => capabilitySetRevision.id),
    competencyRevisionId: uuid("competency_revision_id")
      .notNull()
      .references(() => competencyRevision.id),
    selectionFilter: jsonb("selection_filter").notNull().default(sql`'{}'::jsonb`),
  },
  (t) => [primaryKey({ columns: [t.capabilitySetRevisionId, t.competencyRevisionId] })],
);

export const capabilitySetObjectiveMember = catalogSchema.table(
  "capability_set_objective_member",
  {
    capabilitySetRevisionId: uuid("capability_set_revision_id")
      .notNull()
      .references(() => capabilitySetRevision.id),
    objectiveRevisionId: uuid("objective_revision_id")
      .notNull()
      .references(() => learningObjectiveRevision.id),
  },
  (t) => [primaryKey({ columns: [t.capabilitySetRevisionId, t.objectiveRevisionId] })],
);

export const capabilitySetNestedMember = catalogSchema.table(
  "capability_set_nested_member",
  {
    parentCapabilitySetRevisionId: uuid("parent_capability_set_revision_id").notNull(),
    childCapabilitySetRevisionId: uuid("child_capability_set_revision_id").notNull(),
  },
  (t) => [
    primaryKey({
      name: "pk_capability_set_nested_member",
      columns: [t.parentCapabilitySetRevisionId, t.childCapabilitySetRevisionId],
    }),
    foreignKey({
      name: "fk_capability_set_nested_parent",
      columns: [t.parentCapabilitySetRevisionId],
      foreignColumns: [capabilitySetRevision.id],
    }),
    foreignKey({
      name: "fk_capability_set_nested_child",
      columns: [t.childCapabilitySetRevisionId],
      foreignColumns: [capabilitySetRevision.id],
    }),
    check(
      "ck_capability_set_nested_no_self",
      sql`parent_capability_set_revision_id <> child_capability_set_revision_id`,
    ),
  ],
);
