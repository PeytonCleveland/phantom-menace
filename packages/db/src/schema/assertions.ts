import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  numeric,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { learningObjectiveRevision } from "./catalog";
import { contextDimension, contextValue } from "./context";
import { assertionStateEnum, learnerSchema } from "./enums";
import { observation } from "./evidence";
import { profile } from "./learner";

// ---------------------------------------------------------------------------
// Learner objective assertions (§12.18) — derived, recalculable
// ---------------------------------------------------------------------------

export const objectiveAssertion = learnerSchema.table(
  "objective_assertion",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    learnerId: uuid("learner_id")
      .notNull()
      .references(() => profile.id),
    objectiveRevisionId: uuid("objective_revision_id")
      .notNull()
      .references(() => learningObjectiveRevision.id),
    // Fingerprint only. Qualification matching reads objective_assertion_context
    // and walks the context value closure; it never compares these strings.
    contextKey: text("context_key").notNull().default(""),
    state: assertionStateEnum("state").notNull(),
    confidence: numeric("confidence", { precision: 4, scale: 3 }).notNull(),
    lastDirectEvidenceAt: timestamp("last_direct_evidence_at", { withTimezone: true }),
    lastAnyEvidenceAt: timestamp("last_any_evidence_at", { withTimezone: true }),
    inferenceModelVersion: text("inference_model_version").notNull(),
    calculatedAt: timestamp("calculated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("uq_objective_assertion_scope").on(t.learnerId, t.objectiveRevisionId, t.contextKey),
    check("ck_assertion_confidence", sql`confidence BETWEEN 0 AND 1`),
  ],
);

export const objectiveAssertionContext = learnerSchema.table(
  "objective_assertion_context",
  {
    assertionId: uuid("assertion_id")
      .notNull()
      .references(() => objectiveAssertion.id, { onDelete: "cascade" }),
    dimensionCode: text("dimension_code")
      .notNull()
      .references(() => contextDimension.code),
    // Composite FK below (not a plain reference to contextValue.id) so a row
    // cannot claim dimension `cloud_provider` while pointing at a value that
    // actually belongs to `azure_region`.
    contextValueId: uuid("context_value_id").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.assertionId, t.dimensionCode] }),
    foreignKey({
      name: "fk_objective_assertion_context_value_dimension",
      columns: [t.contextValueId, t.dimensionCode],
      foreignColumns: [contextValue.id, contextValue.dimensionCode],
    }),
  ],
);

export const assertionEvidence = learnerSchema.table(
  "assertion_evidence",
  {
    assertionId: uuid("assertion_id")
      .notNull()
      .references(() => objectiveAssertion.id, { onDelete: "cascade" }),
    evidenceObservationId: uuid("evidence_observation_id")
      .notNull()
      .references(() => observation.id),
    contributionWeight: numeric("contribution_weight", { precision: 6, scale: 5 })
      .notNull()
      .default("1"),
  },
  (t) => [
    primaryKey({ columns: [t.assertionId, t.evidenceObservationId] }),
    check("ck_assertion_evidence_weight", sql`contribution_weight BETWEEN 0 AND 1`),
  ],
);
