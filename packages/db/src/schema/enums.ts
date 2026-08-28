import { pgSchema } from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// PostgreSQL schemas (Lighthouse spec §10 / §12)
// The `governance` schema is created in a custom SQL migration; it holds
// trigger functions rather than drizzle-managed tables.
// ---------------------------------------------------------------------------

export const catalogSchema = pgSchema("catalog");
export const learningSchema = pgSchema("learning");
export const assessmentSchema = pgSchema("assessment");
export const evidenceSchema = pgSchema("evidence");
export const learnerSchema = pgSchema("learner");
export const qualificationSchema = pgSchema("qualification");
export const projectionSchema = pgSchema("projection");
export const authSchema = pgSchema("auth");

// ---------------------------------------------------------------------------
// catalog enums (§12.1, §12.8)
// ---------------------------------------------------------------------------

export const publicationStatusEnum = catalogSchema.enum("publication_status", [
  "draft",
  "published",
  "retired",
]);

export const membershipRoleEnum = catalogSchema.enum("membership_role", ["primary", "secondary"]);

export const relationshipStrengthEnum = catalogSchema.enum("relationship_strength", [
  "hard",
  "strong",
  "soft",
  "empirical",
]);

export const validationStatusEnum = catalogSchema.enum("validation_status", [
  "pending",
  "approved",
  "rejected",
  "deprecated",
]);

export const relationshipProvenanceEnum = catalogSchema.enum("relationship_provenance", [
  "sme",
  "derived",
  "hybrid",
  "ai_suggested",
  "empirical",
]);

export const contextPolicyEnum = catalogSchema.enum("context_policy", [
  "required",
  "optional",
  "not_applicable",
]);

export const criterionKindEnum = catalogSchema.enum("criterion_kind", [
  "success",
  "quality",
  "verification",
  "process",
  "critical_error",
]);

export const objectiveRelationshipTypeEnum = catalogSchema.enum("objective_relationship_type", [
  "performance_requires",
  "learning_precedes",
  "supports",
  "specializes",
  "generalizes",
  "related_to",
  "co_assessed_with",
  "often_confused_with",
]);

export const competencyRelationshipTypeEnum = catalogSchema.enum("competency_relationship_type", [
  "foundation_for",
  "prerequisite_for",
  "applied_in",
  "overlaps_with",
  "specializes",
  "integrates_with",
]);

export const evidenceImplicationTypeEnum = catalogSchema.enum("evidence_implication_type", [
  "evidence_supports",
  "fully_subsumes",
]);

// ---------------------------------------------------------------------------
// assessment enums (§12.1)
// ---------------------------------------------------------------------------

export const taskKindEnum = assessmentSchema.enum("task_kind", [
  "exercise",
  "lab",
  "challenge",
  "mission",
  "workplace_portfolio",
]);

export const administrationModeEnum = assessmentSchema.enum("administration_mode", [
  "practice",
  "formative",
  "summative",
  "qualification",
]);

export const claimRoleEnum = assessmentSchema.enum("claim_role", [
  "primary",
  "supporting",
  "incidental",
]);

// ---------------------------------------------------------------------------
// evidence enums (§12.1)
// ---------------------------------------------------------------------------

export const evidenceStrengthEnum = evidenceSchema.enum("evidence_strength", [
  "direct",
  "supporting",
  "incidental",
]);

export const evidenceOriginEnum = evidenceSchema.enum("evidence_origin", ["direct", "proxy"]);

export const transferLevelEnum = evidenceSchema.enum("transfer_level", [
  "same",
  "near",
  "far",
  "integrated",
]);

export const observationResultEnum = evidenceSchema.enum("observation_result", [
  "successful",
  "partial",
  "unsuccessful",
]);

// ---------------------------------------------------------------------------
// learner enums (§12.1)
// ---------------------------------------------------------------------------

export const assertionStateEnum = learnerSchema.enum("assertion_state", [
  "unassessed",
  "developing",
  "demonstrated",
  "stale",
  "contradicted",
]);

// ---------------------------------------------------------------------------
// qualification enums (§12.1)
// ---------------------------------------------------------------------------

export const requirementOperatorEnum = qualificationSchema.enum("requirement_operator", [
  "all_of",
  "any_of",
  "n_of",
]);
