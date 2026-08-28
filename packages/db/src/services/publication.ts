import { eq, sql } from "drizzle-orm";
import type { Database } from "../client";
import * as s from "../schema/index";

/**
 * Release validation and publication (spec §13.1, §13.2).
 *
 * Database constraints enforce at-most-one primary membership; this service
 * enforces the at-least-one side, endpoint containment, and objective
 * completeness, then flips the release to published — which arms the
 * immutability triggers.
 */

export interface ReleaseValidationResult {
  errors: string[];
  warnings: string[];
}

export async function validateRelease(
  db: Database,
  frameworkReleaseId: string,
): Promise<ReleaseValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  // §13.1 every competency must have exactly one primary domain
  const competenciesMissingPrimary = await db.execute(sql`
    SELECT c.canonical_code
    FROM catalog.framework_release_competency frc
    JOIN catalog.competency_revision cr ON cr.id = frc.competency_revision_id
    JOIN catalog.competency c ON c.id = cr.competency_id
    WHERE frc.framework_release_id = ${frameworkReleaseId}
      AND NOT EXISTS (
        SELECT 1 FROM catalog.domain_competency_membership dcm
        WHERE dcm.framework_release_id = frc.framework_release_id
          AND dcm.competency_revision_id = frc.competency_revision_id
          AND dcm.membership_role = 'primary'
      )
  `);
  for (const row of competenciesMissingPrimary.rows) {
    errors.push(`competency ${row.canonical_code} has no primary domain in this release`);
  }

  // §13.1 every objective must have exactly one primary competency
  const objectivesMissingPrimary = await db.execute(sql`
    SELECT lo.canonical_code
    FROM catalog.framework_release_objective fro
    JOIN catalog.learning_objective_revision lor ON lor.id = fro.objective_revision_id
    JOIN catalog.learning_objective lo ON lo.id = lor.learning_objective_id
    WHERE fro.framework_release_id = ${frameworkReleaseId}
      AND NOT EXISTS (
        SELECT 1 FROM catalog.competency_objective_membership com
        WHERE com.framework_release_id = fro.framework_release_id
          AND com.objective_revision_id = fro.objective_revision_id
          AND com.membership_role = 'primary'
      )
  `);
  for (const row of objectivesMissingPrimary.rows) {
    errors.push(`objective ${row.canonical_code} has no primary competency in this release`);
  }

  // §13.1 every relationship endpoint must be present in the same release
  const danglingObjectiveEdges = await db.execute(sql`
    SELECT r.id
    FROM catalog.objective_relationship r
    WHERE r.framework_release_id = ${frameworkReleaseId}
      AND (
        NOT EXISTS (
          SELECT 1 FROM catalog.framework_release_objective fro
          WHERE fro.framework_release_id = r.framework_release_id
            AND fro.objective_revision_id = r.source_objective_revision_id
        )
        OR NOT EXISTS (
          SELECT 1 FROM catalog.framework_release_objective fro
          WHERE fro.framework_release_id = r.framework_release_id
            AND fro.objective_revision_id = r.target_objective_revision_id
        )
      )
  `);
  for (const row of danglingObjectiveEdges.rows) {
    errors.push(`objective relationship ${row.id} has an endpoint outside this release`);
  }

  const danglingCompetencyEdges = await db.execute(sql`
    SELECT r.id
    FROM catalog.competency_relationship r
    WHERE r.framework_release_id = ${frameworkReleaseId}
      AND (
        NOT EXISTS (
          SELECT 1 FROM catalog.framework_release_competency frc
          WHERE frc.framework_release_id = r.framework_release_id
            AND frc.competency_revision_id = r.source_competency_revision_id
        )
        OR NOT EXISTS (
          SELECT 1 FROM catalog.framework_release_competency frc
          WHERE frc.framework_release_id = r.framework_release_id
            AND frc.competency_revision_id = r.target_competency_revision_id
        )
      )
  `);
  for (const row of danglingCompetencyEdges.rows) {
    errors.push(`competency relationship ${row.id} has an endpoint outside this release`);
  }

  const danglingImplications = await db.execute(sql`
    SELECT i.id
    FROM catalog.objective_evidence_implication i
    WHERE i.framework_release_id = ${frameworkReleaseId}
      AND (
        NOT EXISTS (
          SELECT 1 FROM catalog.framework_release_objective fro
          WHERE fro.framework_release_id = i.framework_release_id
            AND fro.objective_revision_id = i.source_objective_revision_id
        )
        OR NOT EXISTS (
          SELECT 1 FROM catalog.framework_release_objective fro
          WHERE fro.framework_release_id = i.framework_release_id
            AND fro.objective_revision_id = i.target_objective_revision_id
        )
      )
  `);
  for (const row of danglingImplications.rows) {
    errors.push(`evidence implication ${row.id} has an endpoint outside this release`);
  }

  // §13.2 published objectives must be complete (title and statement)
  const incompleteObjectives = await db.execute(sql`
    SELECT lo.canonical_code
    FROM catalog.framework_release_objective fro
    JOIN catalog.learning_objective_revision lor ON lor.id = fro.objective_revision_id
    JOIN catalog.learning_objective lo ON lo.id = lor.learning_objective_id
    WHERE fro.framework_release_id = ${frameworkReleaseId}
      AND (lor.title = '' OR lor.statement = '')
  `);
  for (const row of incompleteObjectives.rows) {
    errors.push(`objective ${row.canonical_code} is missing title or statement`);
  }

  // §13.3 fully_subsumes requires rationale and at least one required criterion.
  const badSubsumes = await db.execute(sql`
    SELECT i.id
    FROM catalog.objective_evidence_implication i
    WHERE i.framework_release_id = ${frameworkReleaseId}
      AND i.implication_type = 'fully_subsumes'
      AND (
        i.rationale = ''
        OR NOT EXISTS (
          SELECT 1 FROM catalog.objective_evidence_implication_criterion ic
          WHERE ic.implication_id = i.id
        )
      )
  `);
  for (const row of badSubsumes.rows) {
    errors.push(`fully_subsumes implication ${row.id} lacks rationale or required criteria`);
  }

  // §13.2 Class B/C objectives should have an evidence contract (task mapping).
  // Tasks arrive in a later phase, so this is a warning for now.
  const missingContracts = await db.execute(sql`
    SELECT lo.canonical_code
    FROM catalog.framework_release_objective fro
    JOIN catalog.learning_objective_revision lor ON lor.id = fro.objective_revision_id
    JOIN catalog.learning_objective lo ON lo.id = lor.learning_objective_id
    WHERE fro.framework_release_id = ${frameworkReleaseId}
      AND lor.default_assurance_class IN ('B', 'C')
      AND NOT EXISTS (
        SELECT 1 FROM assessment.task_objective_evidence_spec spec
        WHERE spec.objective_revision_id = fro.objective_revision_id
      )
  `);
  if (missingContracts.rows.length > 0) {
    warnings.push(
      `${missingContracts.rows.length} Class B/C objectives have no task evidence contract yet`,
    );
  }

  // §2: `direct` means claim-complete, so a direct spec must be able to observe
  // EVERY criterion of its objective — critical errors included. A task that
  // cannot detect data loss is a supporting task, not a direct one.
  const uncoveredCriteria = await db.execute(sql`
    SELECT lo.canonical_code, c.code AS criterion_code
    FROM assessment.task_objective_evidence_spec spec
    JOIN catalog.learning_objective_revision lor ON lor.id = spec.objective_revision_id
    JOIN catalog.learning_objective lo ON lo.id = lor.learning_objective_id
    JOIN catalog.framework_release_objective fro
      ON fro.objective_revision_id = lor.id AND fro.framework_release_id = ${frameworkReleaseId}
    JOIN catalog.objective_criterion c ON c.objective_revision_id = lor.id
    WHERE spec.evidence_strength = 'direct'
      AND NOT EXISTS (
        SELECT 1
        FROM assessment.observable_criterion_mapping m
        JOIN assessment.evidence_spec_observable obs ON obs.id = m.evidence_spec_observable_id
        WHERE obs.evidence_spec_id = spec.id AND m.objective_criterion_id = c.id
      )
  `);
  for (const row of uncoveredCriteria.rows) {
    errors.push(
      `direct evidence spec for ${row.canonical_code} does not observe criterion ${row.criterion_code}`,
    );
  }

  // §5: the verb dictionary must govern, not merely document.
  const verbLevelMismatches = await db.execute(sql`
    SELECT lo.canonical_code, lor.verb_code, lor.mastery_level
    FROM catalog.framework_release_objective fro
    JOIN catalog.learning_objective_revision lor ON lor.id = fro.objective_revision_id
    JOIN catalog.learning_objective lo ON lo.id = lor.learning_objective_id
    JOIN catalog.verb_definition v ON v.code = lor.verb_code
    WHERE fro.framework_release_id = ${frameworkReleaseId}
      AND NOT (lor.mastery_level = ANY(v.allowed_mastery_levels))
  `);
  for (const row of verbLevelMismatches.rows) {
    errors.push(
      `objective ${row.canonical_code} uses verb ${row.verb_code} at L${row.mastery_level}, which the verb does not allow`,
    );
  }

  // Every objective must carry at least one non-critical-error criterion.
  const criterionlessObjectives = await db.execute(sql`
    SELECT lo.canonical_code
    FROM catalog.framework_release_objective fro
    JOIN catalog.learning_objective_revision lor ON lor.id = fro.objective_revision_id
    JOIN catalog.learning_objective lo ON lo.id = lor.learning_objective_id
    WHERE fro.framework_release_id = ${frameworkReleaseId}
      AND NOT EXISTS (
        SELECT 1 FROM catalog.objective_criterion c
        WHERE c.objective_revision_id = lor.id AND c.kind <> 'critical_error'
      )
  `);
  for (const row of criterionlessObjectives.rows) {
    errors.push(`objective ${row.canonical_code} has no non-critical-error criterion`);
  }

  // A required criterion must belong to the implication's SOURCE objective —
  // it describes what the source assessment established. A criterion from any
  // other objective silently corrupts proxy gating.
  const foreignImplicationCriteria = await db.execute(sql`
    SELECT i.id, c.code AS criterion_code
    FROM catalog.objective_evidence_implication i
    JOIN catalog.objective_evidence_implication_criterion ic ON ic.implication_id = i.id
    JOIN catalog.objective_criterion c ON c.id = ic.objective_criterion_id
    WHERE i.framework_release_id = ${frameworkReleaseId}
      AND c.objective_revision_id <> i.source_objective_revision_id
  `);
  for (const row of foreignImplicationCriteria.rows) {
    errors.push(
      `implication ${row.id} requires criterion ${row.criterion_code}, which does not belong to its source objective`,
    );
  }

  return { errors, warnings };
}

export async function publishRelease(
  db: Database,
  frameworkReleaseId: string,
): Promise<ReleaseValidationResult> {
  const result = await validateRelease(db, frameworkReleaseId);
  if (result.errors.length > 0) {
    throw new Error(`release validation failed:\n  - ${result.errors.join("\n  - ")}`);
  }

  await db
    .update(s.frameworkRelease)
    .set({ status: "published", publishedAt: new Date() })
    .where(eq(s.frameworkRelease.id, frameworkReleaseId));

  return result;
}
