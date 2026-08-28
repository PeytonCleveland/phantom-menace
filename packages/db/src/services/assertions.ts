import { and, eq, inArray, sql } from "drizzle-orm";
import type { Database } from "../client";
import * as s from "../schema/index";
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
  transfer_level: string;
  machine_verified: boolean;
  human_verified: boolean;
  observed_at: string;
  details: Record<string, unknown>;
}

export async function recalculateAssertion(
  db: Database,
  learnerId: string,
  objectiveRevisionId: string,
): Promise<{ state: string; confidence: number }> {
  const observationsResult = await db.execute(sql`
    SELECT id, result, evidence_strength, origin, independence_level,
           transfer_level, machine_verified, human_verified, observed_at, details
    FROM evidence.observation
    WHERE learner_id = ${learnerId}
      AND objective_revision_id = ${objectiveRevisionId}
      AND status = 'active'
    ORDER BY observed_at ASC
  `);
  const observations = observationsResult.rows as unknown as ObservationRow[];

  const { state, confidence, contributing } = inferState(observations);

  await db.transaction(async (tx) => {
    // Replace the assertion and its contributing-evidence links.
    await tx
      .delete(s.assertionEvidence)
      .where(
        and(
          eq(s.assertionEvidence.learnerId, learnerId),
          eq(s.assertionEvidence.objectiveRevisionId, objectiveRevisionId),
        ),
      );
    await tx
      .delete(s.objectiveAssertion)
      .where(
        and(
          eq(s.objectiveAssertion.learnerId, learnerId),
          eq(s.objectiveAssertion.objectiveRevisionId, objectiveRevisionId),
        ),
      );

    const directTimes = observations
      .filter((o) => o.origin === "direct" && o.result === "successful")
      .map((o) => o.observed_at);
    const anyTimes = observations.map((o) => o.observed_at);

    await tx.insert(s.objectiveAssertion).values({
      learnerId,
      objectiveRevisionId,
      state: state as (typeof s.assertionStateEnum.enumValues)[number],
      confidence: confidence.toFixed(3),
      lastDirectEvidenceAt: directTimes.length
        ? new Date(String(directTimes[directTimes.length - 1]))
        : null,
      lastAnyEvidenceAt: anyTimes.length ? new Date(String(anyTimes[anyTimes.length - 1])) : null,
      inferenceModelVersion: inferencePolicy.modelVersion,
    });

    for (const { observationId, weight } of contributing) {
      await tx.insert(s.assertionEvidence).values({
        learnerId,
        objectiveRevisionId,
        evidenceObservationId: observationId,
        contributionWeight: weight.toFixed(5),
      });
    }
  });

  return { state, confidence };
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
    if (best.transfer_level !== "same") confidence += inferencePolicy.bonusTransferNearOrBetter;
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
): Promise<Map<string, { state: string; confidence: number }>> {
  const outcomes = new Map<string, { state: string; confidence: number }>();
  if (observationIds.length === 0) return outcomes;

  const pairs = await db
    .selectDistinct({
      learnerId: s.observation.learnerId,
      objectiveRevisionId: s.observation.objectiveRevisionId,
    })
    .from(s.observation)
    .where(inArray(s.observation.id, observationIds));

  for (const pair of pairs) {
    const outcome = await recalculateAssertion(db, pair.learnerId, pair.objectiveRevisionId);
    outcomes.set(pair.objectiveRevisionId, outcome);
  }
  return outcomes;
}
