import { and, eq, inArray, sql } from "drizzle-orm";
import type { Database } from "../client";
import * as s from "../schema/index";
import { canonicalContextKey } from "./context";
import { inferencePolicy } from "./policy";

/**
 * Learner objective assertions (spec §4.10, §12.18).
 * Assertions are derived and recalculable — evidence is the truth.
 *
 * Demo inference policy (see policy.ts):
 * - demonstrated: >= 1 active successful direct-strength observation, where a
 *   proxy-origin observation counts only up to its rule's maximumTargetState
 * - developing: successful supporting evidence, partial results, or proxy
 *   evidence capped at developing
 * - contradicted: latest active observation was unsuccessful
 * - unassessed: no active evidence
 */

interface ObservationRow {
  id: string;
  result: string;
  evidence_strength: string;
  origin: string;
  independence_level: number;
  transfer_distance: string;
  machine_verified: boolean;
  human_verified: boolean;
  observed_at: string;
  details: Record<string, unknown>;
  contexts: Record<string, string>;
}

export interface AssertionOutcome {
  contextKey: string;
  state: string;
  confidence: number;
}

export interface RecalculationDiagnostics {
  /**
   * Observations that were skipped because they were missing a value for at
   * least one of the objective's REQUIRED context dimensions. Spec §1: such
   * evidence genuinely cannot establish a properly scoped claim, and this
   * count is what makes that disappearance visible instead of silent.
   */
  skippedIncompleteContext: number;
}

export interface RecalculationResult {
  outcomes: AssertionOutcome[];
  diagnostics: RecalculationDiagnostics;
}

/**
 * Recalculate every context-scoped assertion for one (learner, objective).
 *
 * Observations are grouped by the objective's REQUIRED dimensions only.
 * Optional dimensions are recorded on the observation and are deliberately
 * invisible here — they would otherwise fragment assertions on a dimension
 * nobody asked to scope by.
 *
 * An observation missing any required dimension is skipped: it happened, but it
 * cannot establish a properly scoped claim.
 */
export async function recalculateAssertionsForObjective(
  db: Database,
  learnerId: string,
  objectiveRevisionId: string,
): Promise<RecalculationResult> {
  const requiredResult = await db.execute(sql`
    SELECT dimension_code FROM catalog.objective_context_policy
    WHERE objective_revision_id = ${objectiveRevisionId} AND policy = 'required'
    ORDER BY dimension_code
  `);
  const requiredDimensions = requiredResult.rows.map((r) => String(r.dimension_code));

  const observationsResult = await db.execute(sql`
    SELECT o.id, o.result, o.evidence_strength, o.origin, o.independence_level,
           o.transfer_distance, o.machine_verified, o.human_verified, o.observed_at, o.details,
           coalesce(
             (SELECT jsonb_object_agg(oc.dimension_code, cv.code)
              FROM evidence.observation_context oc
              JOIN catalog.context_value cv ON cv.id = oc.context_value_id
              WHERE oc.observation_id = o.id),
             '{}'::jsonb
           ) AS contexts
    FROM evidence.observation o
    WHERE o.learner_id = ${learnerId}
      AND o.objective_revision_id = ${objectiveRevisionId}
      AND o.status = 'active'
    ORDER BY o.observed_at ASC
  `);

  // Bucket observations by their required-dimension tuple.
  const buckets = new Map<string, { contexts: Record<string, string>; rows: ObservationRow[] }>();
  let skippedIncompleteContext = 0;
  for (const raw of observationsResult.rows) {
    const contexts = (raw.contexts ?? {}) as Record<string, string>;
    const scoped: Record<string, string> = {};
    let complete = true;
    for (const dimension of requiredDimensions) {
      const value = contexts[dimension];
      if (value === undefined) {
        complete = false;
        break;
      }
      scoped[dimension] = value;
    }
    if (!complete) {
      // Correct per spec §1, but must not be silent — see
      // RecalculationDiagnostics.skippedIncompleteContext.
      skippedIncompleteContext += 1;
      continue;
    }

    const key = canonicalContextKey(scoped);
    const bucket = buckets.get(key) ?? { contexts: scoped, rows: [] };
    bucket.rows.push(raw as unknown as ObservationRow);
    buckets.set(key, bucket);
  }

  const outcomes: AssertionOutcome[] = [];

  await db.transaction(async (tx) => {
    // assertion_evidence and objective_assertion_context cascade on delete.
    await tx
      .delete(s.objectiveAssertion)
      .where(
        and(
          eq(s.objectiveAssertion.learnerId, learnerId),
          eq(s.objectiveAssertion.objectiveRevisionId, objectiveRevisionId),
        ),
      );

    for (const [, bucket] of buckets) {
      const { state, confidence, contributing } = inferState(bucket.rows);

      // The database function is authoritative for the key.
      const keyResult = await tx.execute(
        sql`SELECT governance.canonical_context_key(${JSON.stringify(bucket.contexts)}::jsonb) AS key`,
      );
      const contextKey = String(keyResult.rows[0]?.key ?? "");

      const directTimes = bucket.rows
        .filter((o) => o.origin === "direct" && o.result === "successful")
        .map((o) => o.observed_at);
      const anyTimes = bucket.rows.map((o) => o.observed_at);

      const [assertion] = await tx
        .insert(s.objectiveAssertion)
        .values({
          learnerId,
          objectiveRevisionId,
          contextKey,
          state: state as (typeof s.assertionStateEnum.enumValues)[number],
          confidence: confidence.toFixed(3),
          lastDirectEvidenceAt: directTimes.length
            ? new Date(String(directTimes[directTimes.length - 1]))
            : null,
          lastAnyEvidenceAt: anyTimes.length
            ? new Date(String(anyTimes[anyTimes.length - 1]))
            : null,
          inferenceModelVersion: inferencePolicy.modelVersion,
        })
        .returning({ id: s.objectiveAssertion.id });
      if (!assertion) throw new Error("failed to insert assertion");

      for (const [dimensionCode, valueCode] of Object.entries(bucket.contexts)) {
        const inserted = await tx.execute(sql`
          INSERT INTO learner.objective_assertion_context (assertion_id, dimension_code, context_value_id)
          SELECT ${assertion.id}, ${dimensionCode}, id FROM catalog.context_value
          WHERE dimension_code = ${dimensionCode} AND code = ${valueCode}
        `);
        // An unresolved code must fail loudly: silently inserting zero rows
        // here would leave the assertion's context_key populated but its
        // structured context rows incomplete — a claim that can then never
        // satisfy a pinned requirement, with no error to say why.
        if (inserted.rowCount !== 1) {
          throw new Error(`unknown context value ${dimensionCode}:${valueCode}`);
        }
      }

      for (const { observationId, weight } of contributing) {
        await tx.insert(s.assertionEvidence).values({
          assertionId: assertion.id,
          evidenceObservationId: observationId,
          contributionWeight: weight.toFixed(5),
        });
      }

      outcomes.push({ contextKey, state, confidence });
    }
  });

  return { outcomes, diagnostics: { skippedIncompleteContext } };
}

function inferState(observations: ObservationRow[]): {
  state: string;
  confidence: number;
  contributing: Array<{ observationId: string; weight: number }>;
} {
  if (observations.length === 0) {
    return { state: "unassessed", confidence: 0, contributing: [] };
  }

  const successful = observations.filter((o) => o.result === "successful");
  const partial = observations.filter((o) => o.result === "partial");
  const latest = observations[observations.length - 1];

  // Proxy evidence counts toward `demonstrated` only when its rule allows it.
  const demonstrating = successful.filter(
    (o) =>
      o.evidence_strength === "direct" &&
      (o.origin === "direct" || o.details.maximumTargetState === "demonstrated"),
  );

  const contributing = successful.map((o) => ({
    observationId: o.id,
    weight: o.evidence_strength === "direct" ? 1 : o.evidence_strength === "supporting" ? 0.6 : 0.2,
  }));

  if (demonstrating.length >= inferencePolicy.observationsToDemonstrate) {
    const best = demonstrating[demonstrating.length - 1];
    if (!best) throw new Error("unreachable");
    let confidence: number = inferencePolicy.baseConfidenceDirect;
    if (best.machine_verified) confidence += inferencePolicy.bonusMachineVerified;
    if (best.human_verified) confidence += inferencePolicy.bonusHumanVerified;
    if (Number(best.independence_level) >= 3)
      confidence += inferencePolicy.bonusIndependenceAtLeast3;
    if (best.transfer_distance !== "same") confidence += inferencePolicy.bonusTransferNearOrBetter;
    if (best.origin === "proxy") confidence -= inferencePolicy.proxyPenalty;
    return {
      state: "demonstrated",
      confidence: Math.min(confidence, inferencePolicy.maxConfidence),
      contributing,
    };
  }

  if (successful.length > 0 || partial.length > 0) {
    const hasSupporting = successful.length > 0;
    return {
      state: "developing",
      confidence: hasSupporting
        ? inferencePolicy.baseConfidenceSupporting
        : inferencePolicy.developingConfidence,
      contributing: contributing.length
        ? contributing
        : partial.map((o) => ({ observationId: o.id, weight: 0.2 })),
    };
  }

  // Only unsuccessful evidence remains.
  if (latest && latest.result === "unsuccessful") {
    return {
      state: "contradicted",
      confidence: inferencePolicy.contradictedConfidence,
      contributing: [],
    };
  }

  return { state: "developing", confidence: inferencePolicy.developingConfidence, contributing };
}

/** Recalculate assertions for every objective a set of observations touched. */
export async function recalculateForObservations(
  db: Database,
  observationIds: string[],
): Promise<Map<string, RecalculationResult>> {
  const results = new Map<string, RecalculationResult>();
  if (observationIds.length === 0) return results;

  const pairs = await db
    .selectDistinct({
      learnerId: s.observation.learnerId,
      objectiveRevisionId: s.observation.objectiveRevisionId,
    })
    .from(s.observation)
    .where(inArray(s.observation.id, observationIds));

  for (const pair of pairs) {
    const result = await recalculateAssertionsForObjective(
      db,
      pair.learnerId,
      pair.objectiveRevisionId,
    );
    results.set(pair.objectiveRevisionId, result);
  }
  return results;
}
