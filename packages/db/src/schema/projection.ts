import { sql } from "drizzle-orm";
import { check, integer, jsonb, numeric, primaryKey, timestamp, uuid } from "drizzle-orm/pg-core";
import { competencyRevision, frameworkRelease, learningObjectiveRevision } from "./catalog";
import { competencyRelationshipTypeEnum, projectionSchema } from "./enums";
import { profile } from "./learner";
import { roleLevelRevision } from "./qualification";

// ---------------------------------------------------------------------------
// Derived projections (§12.21) — rebuildable, never authoritative
// ---------------------------------------------------------------------------

export const objectiveDependencyClosure = projectionSchema.table(
  "objective_dependency_closure",
  {
    frameworkReleaseId: uuid("framework_release_id")
      .notNull()
      .references(() => frameworkRelease.id),
    ancestorObjectiveRevisionId: uuid("ancestor_objective_revision_id")
      .notNull()
      .references(() => learningObjectiveRevision.id),
    descendantObjectiveRevisionId: uuid("descendant_objective_revision_id")
      .notNull()
      .references(() => learningObjectiveRevision.id),
    minimumDepth: integer("minimum_depth").notNull(),
  },
  (t) => [
    primaryKey({
      columns: [
        t.frameworkReleaseId,
        t.ancestorObjectiveRevisionId,
        t.descendantObjectiveRevisionId,
      ],
    }),
    check("ck_closure_depth_positive", sql`minimum_depth > 0`),
  ],
);

export const competencyRelationshipProjection = projectionSchema.table(
  "competency_relationship",
  {
    frameworkReleaseId: uuid("framework_release_id")
      .notNull()
      .references(() => frameworkRelease.id),
    sourceCompetencyRevisionId: uuid("source_competency_revision_id")
      .notNull()
      .references(() => competencyRevision.id),
    targetCompetencyRevisionId: uuid("target_competency_revision_id")
      .notNull()
      .references(() => competencyRevision.id),
    inferredType: competencyRelationshipTypeEnum("inferred_type").notNull(),
    supportingEdgeCount: integer("supporting_edge_count").notNull(),
    sourceCoverage: numeric("source_coverage", { precision: 6, scale: 5 }),
    targetCoverage: numeric("target_coverage", { precision: 6, scale: 5 }),
    calculatedAt: timestamp("calculated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({
      columns: [
        t.frameworkReleaseId,
        t.sourceCompetencyRevisionId,
        t.targetCompetencyRevisionId,
        t.inferredType,
      ],
    }),
  ],
);

export const frontierSnapshot = projectionSchema.table("frontier_snapshot", {
  id: uuid("id").primaryKey().defaultRandom(),
  learnerId: uuid("learner_id")
    .notNull()
    .references(() => profile.id),
  roleLevelRevisionId: uuid("role_level_revision_id")
    .notNull()
    .references(() => roleLevelRevision.id),
  calculatedAt: timestamp("calculated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const frontierItem = projectionSchema.table(
  "frontier_item",
  {
    frontierSnapshotId: uuid("frontier_snapshot_id")
      .notNull()
      .references(() => frontierSnapshot.id),
    objectiveRevisionId: uuid("objective_revision_id")
      .notNull()
      .references(() => learningObjectiveRevision.id),
    frontierScore: numeric("frontier_score", { precision: 8, scale: 5 }).notNull(),
    reasons: jsonb("reasons").notNull().default(sql`'[]'::jsonb`),
    recommendedAction: jsonb("recommended_action").notNull().default(sql`'{}'::jsonb`),
  },
  (t) => [primaryKey({ columns: [t.frontierSnapshotId, t.objectiveRevisionId] })],
);
