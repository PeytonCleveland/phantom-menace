import { sql } from "drizzle-orm";
import { check, foreignKey, numeric, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { learningObjectiveRevision } from "./catalog";
import { assertionStateEnum, learnerSchema } from "./enums";
import { observation } from "./evidence";
import { profile } from "./learner";

// ---------------------------------------------------------------------------
// Learner objective assertions (§12.18) — derived, recalculable
// ---------------------------------------------------------------------------

export const objectiveAssertion = learnerSchema.table(
  "objective_assertion",
  {
    learnerId: uuid("learner_id")
      .notNull()
      .references(() => profile.id),
    objectiveRevisionId: uuid("objective_revision_id")
      .notNull()
      .references(() => learningObjectiveRevision.id),
    state: assertionStateEnum("state").notNull(),
    confidence: numeric("confidence", { precision: 4, scale: 3 }).notNull(),
    lastDirectEvidenceAt: timestamp("last_direct_evidence_at", { withTimezone: true }),
    lastAnyEvidenceAt: timestamp("last_any_evidence_at", { withTimezone: true }),
    inferenceModelVersion: text("inference_model_version").notNull(),
    calculatedAt: timestamp("calculated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.learnerId, t.objectiveRevisionId] }),
    check("ck_assertion_confidence", sql`confidence BETWEEN 0 AND 1`),
  ],
);

export const assertionEvidence = learnerSchema.table(
  "assertion_evidence",
  {
    learnerId: uuid("learner_id").notNull(),
    objectiveRevisionId: uuid("objective_revision_id").notNull(),
    evidenceObservationId: uuid("evidence_observation_id")
      .notNull()
      .references(() => observation.id),
    contributionWeight: numeric("contribution_weight", { precision: 6, scale: 5 })
      .notNull()
      .default("1"),
  },
  (t) => [
    primaryKey({
      columns: [t.learnerId, t.objectiveRevisionId, t.evidenceObservationId],
    }),
    foreignKey({
      name: "fk_assertion_evidence_assertion",
      columns: [t.learnerId, t.objectiveRevisionId],
      foreignColumns: [objectiveAssertion.learnerId, objectiveAssertion.objectiveRevisionId],
    }),
    check("ck_assertion_evidence_weight", sql`contribution_weight BETWEEN 0 AND 1`),
  ],
);
