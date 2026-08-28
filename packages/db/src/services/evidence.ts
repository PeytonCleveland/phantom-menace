import { sql } from "drizzle-orm";
import type { Database } from "../client";
import * as s from "../schema/index";

/**
 * Evidence recording and proxy propagation (spec §14).
 *
 * Observations are append-only (DB-enforced). Propagation runs only from
 * successful direct-origin observations, through SME-approved automatic
 * implication rules, gated on required observables and critical errors, and
 * never recurses from proxy evidence unless the rule is explicitly transitive.
 */

export interface ObservableResultInput {
  code: string;
  result: "successful" | "partial" | "unsuccessful";
  score?: number;
  notes?: string;
}

export interface RecordObservationInput {
  learnerId: string;
  attemptId?: string;
  objectiveRevisionId: string;
  evidenceSpecId?: string;
  result: "successful" | "partial" | "unsuccessful";
  evidenceStrength: "direct" | "supporting" | "incidental";
  independenceLevel: 0 | 1 | 2 | 3 | 4;
  transferLevel: "same" | "near" | "far" | "integrated";
  rubricScore?: number;
  machineVerified?: boolean;
  humanVerified?: boolean;
  details?: Record<string, unknown>;
  observableResults?: ObservableResultInput[];
}

export async function recordObservation(
  db: Database,
  input: RecordObservationInput,
): Promise<string> {
  return db.transaction(async (tx) => {
    const [observation] = await tx
      .insert(s.observation)
      .values({
        learnerId: input.learnerId,
        attemptId: input.attemptId,
        objectiveRevisionId: input.objectiveRevisionId,
        evidenceSpecId: input.evidenceSpecId,
        result: input.result,
        evidenceStrength: input.evidenceStrength,
        origin: "direct",
        independenceLevel: input.independenceLevel,
        transferLevel: input.transferLevel,
        rubricScore: input.rubricScore?.toString(),
        machineVerified: input.machineVerified ?? false,
        humanVerified: input.humanVerified ?? false,
        details: input.details ?? {},
      })
      .returning({ id: s.observation.id });
    if (!observation) throw new Error("failed to insert observation");

    for (const observable of input.observableResults ?? []) {
      await tx.insert(s.observableResult).values({
        evidenceObservationId: observation.id,
        observableCode: observable.code,
        // Composite FK validates the code against the spec's observables.
        evidenceSpecId: input.evidenceSpecId,
        result: observable.result,
        score: observable.score?.toString(),
        notes: observable.notes,
      });
    }

    return observation.id;
  });
}

export interface PropagationResult {
  createdProxyObservationIds: string[];
  skipped: Array<{ targetObjectiveCode: string; reason: string }>;
}

/**
 * §14 steps 4–5: propagate proxy evidence from one direct observation.
 */
export async function propagateFromObservation(
  db: Database,
  observationId: string,
  options?: { fromProxy?: boolean },
): Promise<PropagationResult> {
  const result: PropagationResult = { createdProxyObservationIds: [], skipped: [] };

  const observationResult = await db.execute(sql`
    SELECT o.*, spec.proxy_propagation_allowed
    FROM evidence.observation o
    LEFT JOIN assessment.task_objective_evidence_spec spec ON spec.id = o.evidence_spec_id
    WHERE o.id = ${observationId}
  `);
  const observation = observationResult.rows[0];
  if (!observation) throw new Error(`observation ${observationId} not found`);

  // Only successful, active observations propagate.
  if (observation.status !== "active" || observation.result !== "successful") return result;

  // §14.5: proxy evidence does not recursively propagate unless invoked
  // explicitly for a transitive rule.
  if (observation.origin === "proxy" && !options?.fromProxy) return result;

  // §14.4d: task policy must allow proxy propagation.
  if (observation.proxy_propagation_allowed === false) {
    result.skipped.push({
      targetObjectiveCode: "*",
      reason: "task evidence spec forbids proxy propagation",
    });
    return result;
  }

  // §14.4g: critical errors on the source block propagation — any critical
  // observable that was not successful.
  const criticalFailures = await db.execute(sql`
    SELECT obs.code
    FROM evidence.observable_result r
    JOIN assessment.evidence_spec_observable obs
      ON obs.evidence_spec_id = r.evidence_spec_id AND obs.code = r.observable_code
    WHERE r.evidence_observation_id = ${observationId}
      AND obs.critical AND r.result <> 'successful'
  `);
  if (criticalFailures.rows.length > 0) {
    result.skipped.push({
      targetObjectiveCode: "*",
      reason: `critical observable(s) failed: ${criticalFailures.rows.map((r) => r.code).join(", ")}`,
    });
    return result;
  }

  // §14.4a: approved automatic implication rules for this source objective.
  const rules = await db.execute(sql`
    SELECT i.*, tlo.canonical_code AS target_code
    FROM catalog.objective_evidence_implication i
    JOIN catalog.learning_objective_revision tlor ON tlor.id = i.target_objective_revision_id
    JOIN catalog.learning_objective tlo ON tlo.id = tlor.learning_objective_id
    WHERE i.source_objective_revision_id = ${observation.objective_revision_id}
      AND i.validation_status = 'approved'
      AND i.automatic
  `);

  for (const rule of rules.rows) {
    const targetCode = String(rule.target_code);

    // §14.4b: required observables must have been elicited and successful.
    const requiredCodes = (rule.required_observable_codes ?? []) as string[];
    if (requiredCodes.length > 0) {
      const successful = await db.execute(sql`
        SELECT observable_code FROM evidence.observable_result
        WHERE evidence_observation_id = ${observationId} AND result = 'successful'
      `);
      const successfulCodes = new Set(successful.rows.map((r) => String(r.observable_code)));
      const missing = requiredCodes.filter((code) => !successfulCodes.has(code));
      if (missing.length > 0) {
        result.skipped.push({
          targetObjectiveCode: targetCode,
          reason: `required observables not satisfied: ${missing.join(", ")}`,
        });
        continue;
      }
    }

    // §14 uniqueness: one proxy per source evidence + target objective + rule.
    const existing = await db.execute(sql`
      SELECT 1 FROM evidence.observation
      WHERE source_evidence_id = ${observationId}
        AND objective_revision_id = ${rule.target_objective_revision_id}
        AND status = 'active'
    `);
    if (existing.rows.length > 0) {
      result.skipped.push({ targetObjectiveCode: targetCode, reason: "already propagated" });
      continue;
    }

    // §14.4e/f: insert proxy evidence with lineage, rule strength, and cap.
    const [proxy] = await db
      .insert(s.observation)
      .values({
        learnerId: String(observation.learner_id),
        attemptId: observation.attempt_id ? String(observation.attempt_id) : undefined,
        objectiveRevisionId: String(rule.target_objective_revision_id),
        result: "successful",
        evidenceStrength: rule.derived_evidence_strength as "direct" | "supporting" | "incidental",
        origin: "proxy",
        independenceLevel: Number(observation.independence_level),
        transferLevel: observation.transfer_level as "same" | "near" | "far" | "integrated",
        machineVerified: Boolean(observation.machine_verified),
        humanVerified: false,
        sourceEvidenceId: observationId,
        details: {
          implicationType: rule.implication_type,
          implicationId: rule.id,
          maximumTargetState: rule.maximum_target_state,
          requiredObservableCodes: requiredCodes,
        },
      })
      .returning({ id: s.observation.id });
    if (!proxy) throw new Error("failed to insert proxy observation");
    result.createdProxyObservationIds.push(proxy.id);

    // §14.5: recurse only when the rule is explicitly transitive.
    if (rule.transitive === true) {
      const nested = await propagateFromObservation(db, proxy.id, { fromProxy: true });
      result.createdProxyObservationIds.push(...nested.createdProxyObservationIds);
      result.skipped.push(...nested.skipped);
    }
  }

  return result;
}
