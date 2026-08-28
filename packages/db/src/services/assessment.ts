import { sql } from "drizzle-orm";
import type { Database } from "../client";
import * as s from "../schema/index";
import type { TaskSeed } from "../seed/data/tasks";

/**
 * Task creation (spec §12.15, §13.4).
 * Enforces: evidence ceiling must be at least the level of every directly
 * measured objective. (Observable/criterion-coverage validation for direct
 * evidence mappings lives in publication.ts, not here — see Task 10.)
 */

export interface CreatedTask {
  taskTemplateId: string;
  taskRevisionId: string;
  variantIdByCode: Map<string, string>;
  administrationIdByMode: Map<string, string>;
  evidenceSpecIdByObjectiveCode: Map<string, string>;
}

export async function createTask(
  db: Database,
  frameworkReleaseId: string,
  seed: TaskSeed,
  criterionIdByCode: ReadonlyMap<string, string>,
): Promise<CreatedTask> {
  return db.transaction(async (tx) => {
    const [template] = await tx
      .insert(s.taskTemplate)
      .values({ canonicalCode: seed.code })
      .returning({ id: s.taskTemplate.id });
    if (!template) throw new Error(`failed to insert task template ${seed.code}`);

    const [revision] = await tx
      .insert(s.taskRevision)
      .values({
        taskTemplateId: template.id,
        revisionNo: 1,
        frameworkReleaseId,
        title: seed.title,
        taskKind: seed.taskKind,
        scenario: seed.scenario,
        instructions: seed.instructions,
        designEvidenceCeiling: seed.designEvidenceCeiling,
        estimatedMinutes: seed.estimatedMinutes,
      })
      .returning({ id: s.taskRevision.id });
    if (!revision) throw new Error(`failed to insert task revision ${seed.code}`);

    const variantIdByCode = new Map<string, string>();
    for (const variant of seed.variants) {
      const [created] = await tx
        .insert(s.taskVariant)
        .values({
          taskRevisionId: revision.id,
          code: variant.code,
          variantConfig: variant.variantConfig,
          transferDistanceDefault: variant.transferDistanceDefault,
          performanceScopeDefault: variant.performanceScopeDefault,
        })
        .returning({ id: s.taskVariant.id });
      if (!created) throw new Error(`failed to insert variant ${variant.code}`);
      variantIdByCode.set(variant.code, created.id);
    }

    const evidenceSpecIdByObjectiveCode = new Map<string, string>();
    for (const spec of seed.evidenceSpecs) {
      const objectiveResult = await tx.execute(sql`
        SELECT lor.id, lor.mastery_level
        FROM catalog.learning_objective_revision lor
        JOIN catalog.learning_objective lo ON lo.id = lor.learning_objective_id
        JOIN catalog.framework_release_objective fro ON fro.objective_revision_id = lor.id
        WHERE lo.canonical_code = ${spec.objectiveCode}
          AND fro.framework_release_id = ${frameworkReleaseId}
      `);
      const objective = objectiveResult.rows[0];
      if (!objective) throw new Error(`objective ${spec.objectiveCode} not found in release`);

      // §13.4: ceiling must cover every directly measured objective.
      if (
        spec.evidenceStrength === "direct" &&
        Number(objective.mastery_level) > seed.designEvidenceCeiling
      ) {
        throw new Error(
          `task ${seed.code} design ceiling ${seed.designEvidenceCeiling} is below directly measured objective ${spec.objectiveCode} (L${objective.mastery_level})`,
        );
      }

      const [createdSpec] = await tx
        .insert(s.taskObjectiveEvidenceSpec)
        .values({
          taskRevisionId: revision.id,
          objectiveRevisionId: objective.id as string,
          claimRole: spec.claimRole,
          evidenceStrength: spec.evidenceStrength,
          minimumIndependence: spec.minimumIndependence,
          minimumTransferDistance: spec.minimumTransferDistance,
          minimumPerformanceScope: spec.minimumPerformanceScope,
          proxyPropagationAllowed: spec.proxyPropagationAllowed ?? true,
        })
        .returning({ id: s.taskObjectiveEvidenceSpec.id });
      if (!createdSpec) throw new Error(`failed to insert evidence spec ${spec.objectiveCode}`);
      evidenceSpecIdByObjectiveCode.set(spec.objectiveCode, createdSpec.id);

      for (const [index, observable] of (spec.observables ?? []).entries()) {
        const [createdObservable] = await tx
          .insert(s.evidenceSpecObservable)
          .values({
            evidenceSpecId: createdSpec.id,
            code: observable.code,
            statement: observable.statement,
            observableType: observable.observableType,
            sortOrder: index,
          })
          .returning({ id: s.evidenceSpecObservable.id });
        if (!createdObservable) throw new Error(`failed to insert observable ${observable.code}`);

        for (const criterionCode of observable.criterionCodes ?? []) {
          const key = `${spec.objectiveCode}:${criterionCode}`;
          const criterionId = criterionIdByCode.get(key);
          if (!criterionId) throw new Error(`unknown criterion ${key}`);
          await tx.insert(s.observableCriterionMapping).values({
            evidenceSpecObservableId: createdObservable.id,
            objectiveCriterionId: criterionId,
          });
        }
      }
    }

    const administrationIdByMode = new Map<string, string>();
    for (const administration of seed.administrations) {
      const variantId = variantIdByCode.get(administration.variantCode);
      if (!variantId) throw new Error(`unknown variant ${administration.variantCode}`);
      const [created] = await tx
        .insert(s.taskAdministration)
        .values({
          taskVariantId: variantId,
          mode: administration.mode,
          assistancePolicy: administration.assistancePolicy,
          processCaptureEnabled: administration.processCaptureEnabled,
          effectiveEvidenceCeiling: administration.effectiveEvidenceCeiling,
        })
        .returning({ id: s.taskAdministration.id });
      if (!created) throw new Error("failed to insert task administration");
      administrationIdByMode.set(administration.mode, created.id);
    }

    return {
      taskTemplateId: template.id,
      taskRevisionId: revision.id,
      variantIdByCode,
      administrationIdByMode,
      evidenceSpecIdByObjectiveCode,
    };
  });
}
