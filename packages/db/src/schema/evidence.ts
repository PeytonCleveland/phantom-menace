import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  foreignKey,
  index,
  jsonb,
  numeric,
  primaryKey,
  smallint,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { evidenceSpecObservable, learnerAttempt, taskObjectiveEvidenceSpec } from "./assessment";
import { learningObjectiveRevision } from "./catalog";
import { contextDimension, contextValue } from "./context";
import {
  evidenceOriginEnum,
  evidenceSchema,
  evidenceStrengthEnum,
  observationResultEnum,
  performanceScopeEnum,
  transferDistanceEnum,
} from "./enums";
import { profile } from "./learner";

// ---------------------------------------------------------------------------
// Artifacts (§12.17)
// ---------------------------------------------------------------------------

export const artifact = evidenceSchema.table("artifact", {
  id: uuid("id").primaryKey().defaultRandom(),
  learnerId: uuid("learner_id").references(() => profile.id),
  attemptId: uuid("attempt_id").references(() => learnerAttempt.id),
  artifactType: text("artifact_type").notNull(),
  storageUri: text("storage_uri").notNull(),
  contentHash: text("content_hash").notNull(),
  mediaType: text("media_type"),
  classification: text("classification"),
  retentionPolicy: text("retention_policy"),
  metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Evidence observations (§12.17) — append-only, enforced by trigger
// ---------------------------------------------------------------------------

export const observation = evidenceSchema.table(
  "observation",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    learnerId: uuid("learner_id")
      .notNull()
      .references(() => profile.id),
    attemptId: uuid("attempt_id").references(() => learnerAttempt.id),
    objectiveRevisionId: uuid("objective_revision_id")
      .notNull()
      .references(() => learningObjectiveRevision.id),
    evidenceSpecId: uuid("evidence_spec_id").references(() => taskObjectiveEvidenceSpec.id),
    result: observationResultEnum("result").notNull(),
    evidenceStrength: evidenceStrengthEnum("evidence_strength").notNull(),
    origin: evidenceOriginEnum("origin").notNull(),
    independenceLevel: smallint("independence_level").notNull(),
    transferDistance: transferDistanceEnum("transfer_distance").notNull(),
    performanceScope: performanceScopeEnum("performance_scope").notNull().default("focused"),
    rubricScore: numeric("rubric_score", { precision: 6, scale: 5 }),
    machineVerified: boolean("machine_verified").notNull().default(false),
    humanVerified: boolean("human_verified").notNull().default(false),
    sourceEvidenceId: uuid("source_evidence_id").references((): AnyPgColumn => observation.id),
    status: text("status").notNull().default("active"),
    details: jsonb("details").notNull().default(sql`'{}'::jsonb`),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("ck_observation_independence", sql`independence_level BETWEEN 0 AND 4`),
    check("ck_observation_rubric_score", sql`rubric_score IS NULL OR rubric_score BETWEEN 0 AND 1`),
    check("ck_observation_status", sql`status IN ('active', 'voided', 'superseded')`),
    check(
      "ck_observation_origin_source",
      sql`(origin = 'direct' AND source_evidence_id IS NULL) OR (origin = 'proxy' AND source_evidence_id IS NOT NULL)`,
    ),
    index("ix_evidence_learner_objective_time").on(
      t.learnerId,
      t.objectiveRevisionId,
      t.observedAt.desc(),
    ),
    index("ix_evidence_source").on(t.sourceEvidenceId),
    index("ix_evidence_attempt").on(t.attemptId),
  ],
);

// ---------------------------------------------------------------------------
// Observable results (§12.17)
// Deviation from spec DDL: carries evidence_spec_id with a composite FK to
// assessment.evidence_spec_observable so observable codes are validated
// against the task's evidence contract. This matters because fully_subsumes
// propagation gates on these codes (§14.4b).
// ---------------------------------------------------------------------------

export const observableResult = evidenceSchema.table(
  "observable_result",
  {
    evidenceObservationId: uuid("evidence_observation_id")
      .notNull()
      .references(() => observation.id),
    observableCode: text("observable_code").notNull(),
    evidenceSpecId: uuid("evidence_spec_id"),
    result: observationResultEnum("result").notNull(),
    score: numeric("score", { precision: 6, scale: 5 }),
    notes: text("notes"),
  },
  (t) => [
    primaryKey({ columns: [t.evidenceObservationId, t.observableCode] }),
    foreignKey({
      name: "fk_observable_result_spec_observable",
      columns: [t.evidenceSpecId, t.observableCode],
      foreignColumns: [evidenceSpecObservable.evidenceSpecId, evidenceSpecObservable.code],
    }),
    check("ck_observable_result_score", sql`score IS NULL OR score BETWEEN 0 AND 1`),
  ],
);

export const observationContext = evidenceSchema.table(
  "observation_context",
  {
    observationId: uuid("observation_id")
      .notNull()
      .references(() => observation.id),
    dimensionCode: text("dimension_code")
      .notNull()
      .references(() => contextDimension.code),
    contextValueId: uuid("context_value_id")
      .notNull()
      .references(() => contextValue.id),
  },
  (t) => [primaryKey({ columns: [t.observationId, t.dimensionCode] })],
);

export const observationArtifact = evidenceSchema.table(
  "observation_artifact",
  {
    evidenceObservationId: uuid("evidence_observation_id")
      .notNull()
      .references(() => observation.id),
    artifactId: uuid("artifact_id")
      .notNull()
      .references(() => artifact.id),
  },
  (t) => [primaryKey({ columns: [t.evidenceObservationId, t.artifactId] })],
);
