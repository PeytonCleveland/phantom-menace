import { sql } from "drizzle-orm";
import type { Database } from "../client";
import * as s from "../schema/index";
import { type TransferLevel, transferAtLeast } from "./policy";

/**
 * Role satisfaction evaluation (spec §15.5).
 *
 * A requirement is satisfied when the learner's assertion is `demonstrated`
 * AND at least one active successful direct-strength observation meets the
 * requirement's evidence policy (origin, independence, transfer, age).
 * Direct and proxy satisfaction are distinguished so policies that demand
 * direct evidence reject proxy-only demonstrations (§7.4.10, §25.14).
 */

export interface RequirementEvaluation {
  objectiveCode: string;
  satisfied: boolean;
  via: "direct" | "proxy" | null;
  reason: string;
  directEvidenceRequired: boolean;
}

export interface GroupEvaluation {
  label: string;
  operator: string;
  minimumCount: number | null;
  satisfied: boolean;
  requirements: RequirementEvaluation[];
  children: GroupEvaluation[];
}

export interface RoleStateResult {
  state: string;
  readinessScore: number;
  requirementsMet: number;
  requirementsTotal: number;
  roots: GroupEvaluation[];
  blockers: string[];
}

export interface EvidencePolicyCheck {
  directEvidenceRequired: boolean;
  proxyEvidenceAllowed: boolean;
  minimumIndependence: number | null;
  minimumTransfer: TransferLevel | null;
  maximumEvidenceAge: string | null;
}

/**
 * Check whether a learner satisfies one objective under an evidence policy.
 * Exposed separately so callers can test hypothetical policies (e.g. show
 * that proxy-only evidence fails a direct-evidence-required policy).
 */
export async function checkObjectiveSatisfaction(
  db: Database,
  learnerId: string,
  objectiveRevisionId: string,
  policy: EvidencePolicyCheck,
): Promise<{ satisfied: boolean; via: "direct" | "proxy" | null; reason: string }> {
  const assertionResult = await db.execute(sql`
    SELECT state FROM learner.objective_assertion
    WHERE learner_id = ${learnerId} AND objective_revision_id = ${objectiveRevisionId}
  `);
  const state = assertionResult.rows[0]?.state;
  if (state !== "demonstrated") {
    return { satisfied: false, via: null, reason: `assertion state is ${state ?? "unassessed"}` };
  }

  const observations = await db.execute(sql`
    SELECT origin, independence_level, transfer_level, observed_at
    FROM evidence.observation
    WHERE learner_id = ${learnerId}
      AND objective_revision_id = ${objectiveRevisionId}
      AND status = 'active'
      AND result = 'successful'
      AND evidence_strength = 'direct'
      AND (${policy.maximumEvidenceAge}::interval IS NULL
           OR observed_at >= now() - ${policy.maximumEvidenceAge}::interval)
    ORDER BY origin ASC -- 'direct' sorts before 'proxy'
  `);

  const requireDirectOrigin = policy.directEvidenceRequired || !policy.proxyEvidenceAllowed;

  for (const row of observations.rows) {
    const origin = String(row.origin) as "direct" | "proxy";
    if (requireDirectOrigin && origin !== "direct") continue;
    if (
      policy.minimumIndependence !== null &&
      Number(row.independence_level) < policy.minimumIndependence
    ) {
      continue;
    }
    if (
      policy.minimumTransfer !== null &&
      !transferAtLeast(String(row.transfer_level) as TransferLevel, policy.minimumTransfer)
    ) {
      continue;
    }
    return { satisfied: true, via: origin, reason: `qualifying ${origin} evidence` };
  }

  return {
    satisfied: false,
    via: null,
    reason: requireDirectOrigin
      ? "demonstrated, but no qualifying direct-origin evidence (proxy not accepted)"
      : "demonstrated, but no evidence meets independence/transfer/recency policy",
  };
}

export async function evaluateRoleState(
  db: Database,
  learnerId: string,
  roleLevelRevisionId: string,
): Promise<RoleStateResult> {
  const groupsResult = await db.execute(sql`
    SELECT id, parent_group_id, operator, minimum_count, label
    FROM qualification.requirement_group
    WHERE role_level_revision_id = ${roleLevelRevisionId}
    ORDER BY sort_order NULLS LAST, label
  `);

  const requirementsResult = await db.execute(sql`
    SELECT oreq.requirement_group_id, oreq.objective_revision_id,
           oreq.direct_evidence_required, oreq.proxy_evidence_allowed,
           oreq.minimum_independence, oreq.minimum_transfer, oreq.maximum_evidence_age,
           lo.canonical_code
    FROM qualification.objective_requirement oreq
    JOIN catalog.learning_objective_revision lor ON lor.id = oreq.objective_revision_id
    JOIN catalog.learning_objective lo ON lo.id = lor.learning_objective_id
    JOIN qualification.requirement_group g ON g.id = oreq.requirement_group_id
    WHERE g.role_level_revision_id = ${roleLevelRevisionId}
    ORDER BY lo.canonical_code
  `);

  // Evaluate every requirement once.
  const requirementsByGroup = new Map<string, RequirementEvaluation[]>();
  let met = 0;
  const blockers: string[] = [];

  for (const row of requirementsResult.rows) {
    const groupId = String(row.requirement_group_id);
    const evaluation = await checkObjectiveSatisfaction(
      db,
      learnerId,
      String(row.objective_revision_id),
      {
        directEvidenceRequired: Boolean(row.direct_evidence_required),
        proxyEvidenceAllowed: Boolean(row.proxy_evidence_allowed),
        minimumIndependence:
          row.minimum_independence === null ? null : Number(row.minimum_independence),
        minimumTransfer: (row.minimum_transfer as TransferLevel | null) ?? null,
        maximumEvidenceAge: row.maximum_evidence_age ? String(row.maximum_evidence_age) : null,
      },
    );

    const requirement: RequirementEvaluation = {
      objectiveCode: String(row.canonical_code),
      satisfied: evaluation.satisfied,
      via: evaluation.via,
      reason: evaluation.reason,
      directEvidenceRequired: Boolean(row.direct_evidence_required),
    };
    if (evaluation.satisfied) met += 1;

    const list = requirementsByGroup.get(groupId) ?? [];
    list.push(requirement);
    requirementsByGroup.set(groupId, list);
  }

  // Build and evaluate the group tree bottom-up.
  interface GroupRow {
    id: string;
    parent: string | null;
    operator: string;
    minimumCount: number | null;
    label: string;
  }
  const groups: GroupRow[] = groupsResult.rows.map((row) => ({
    id: String(row.id),
    parent: row.parent_group_id ? String(row.parent_group_id) : null,
    operator: String(row.operator),
    minimumCount: row.minimum_count === null ? null : Number(row.minimum_count),
    label: String(row.label ?? ""),
  }));

  const childrenByParent = new Map<string | null, GroupRow[]>();
  for (const group of groups) {
    const list = childrenByParent.get(group.parent) ?? [];
    list.push(group);
    childrenByParent.set(group.parent, list);
  }

  function evaluateGroup(group: GroupRow): GroupEvaluation {
    const requirements = requirementsByGroup.get(group.id) ?? [];
    const children = (childrenByParent.get(group.id) ?? []).map(evaluateGroup);

    const outcomes = [...requirements.map((r) => r.satisfied), ...children.map((c) => c.satisfied)];
    let satisfied: boolean;
    switch (group.operator) {
      case "all_of":
        satisfied = outcomes.length > 0 && outcomes.every(Boolean);
        break;
      case "any_of":
        satisfied = outcomes.some(Boolean);
        break;
      case "n_of":
        satisfied =
          outcomes.filter(Boolean).length >= (group.minimumCount ?? Number.POSITIVE_INFINITY);
        break;
      default:
        satisfied = false;
    }

    if (!satisfied) {
      const unmetHere = requirements.filter((r) => !r.satisfied).map((r) => r.objectiveCode);
      if (unmetHere.length > 0) {
        blockers.push(
          `${group.label}: ${unmetHere.slice(0, 5).join(", ")}${unmetHere.length > 5 ? "…" : ""}`,
        );
      }
    }

    return {
      label: group.label,
      operator: group.operator,
      minimumCount: group.minimumCount,
      satisfied,
      requirements,
      children,
    };
  }

  const roots = (childrenByParent.get(null) ?? []).map(evaluateGroup);
  const total = requirementsResult.rows.length;
  const rootSatisfied = roots.length > 0 && roots.every((r) => r.satisfied);
  const state = rootSatisfied ? "ready_for_review" : met > 0 ? "in_progress" : "not_started";
  const readinessScore = total === 0 ? 0 : met / total;

  await db
    .insert(s.learnerRoleState)
    .values({
      learnerId,
      roleLevelRevisionId,
      state,
      readinessScore: readinessScore.toFixed(5),
      requirementsMet: met,
      requirementsTotal: total,
      blockers,
    })
    .onConflictDoUpdate({
      target: [s.learnerRoleState.learnerId, s.learnerRoleState.roleLevelRevisionId],
      set: {
        state,
        readinessScore: readinessScore.toFixed(5),
        requirementsMet: met,
        requirementsTotal: total,
        blockers,
        calculatedAt: new Date(),
      },
    });

  return { state, readinessScore, requirementsMet: met, requirementsTotal: total, roots, blockers };
}
