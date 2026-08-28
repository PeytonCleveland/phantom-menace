import { sql } from "drizzle-orm";
import type { Database } from "../client";
import * as s from "../schema/index";
import {
  type PerformanceScope,
  performanceScopeAtLeast,
  type TransferDistance,
  transferDistanceAtLeast,
} from "./policy";

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

export interface RequirementContextCheck {
  dimensionCode: string;
  /** Pinned value code, or null when the requirement demands breadth instead. */
  valueCode: string | null;
  minimumDistinctValues: number;
}

export interface EvidencePolicyCheck {
  directEvidenceRequired: boolean;
  proxyEvidenceAllowed: boolean;
  minimumIndependence: number | null;
  minimumTransferDistance: TransferDistance | null;
  minimumPerformanceScope: PerformanceScope | null;
  maximumEvidenceAge: string | null;
  contexts: RequirementContextCheck[];
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
  // Assertions are scoped by context. A requirement pinning value V is
  // satisfied by an assertion at V or ANY DESCENDANT of V, because a child
  // value means "evidence here is valid evidence for the parent".
  //
  // This walks structured context rows. It must never compare context_key
  // strings: an assertion keyed cloud_provider=aws_govcloud satisfies a
  // requirement for cloud_provider=aws, and those strings differ.
  //
  // Built as ARRAY[...]::text[] (via sql.join) rather than interpolating the
  // JS array directly: drizzle's sql`` tag renders an interpolated array as
  // a parenthesized, comma-separated param list (e.g. `($1, $2)`), not a
  // bound Postgres array — so `${arr}::text[]` is invalid SQL, and doubly so
  // when `arr` is empty (`()::text[]` is a syntax error). ARRAY[]::text[] is
  // valid and denotes "no pinned dimensions" correctly.
  const pinnedContexts = policy.contexts.filter((c) => c.valueCode !== null);
  const assertionsResult = await db.execute(sql`
    WITH RECURSIVE pinned AS (
      SELECT cv.id, cv.dimension_code
      FROM catalog.context_value cv
      WHERE (cv.dimension_code, cv.code) IN (
        SELECT * FROM unnest(
          ARRAY[${sql.join(
            pinnedContexts.map((c) => sql`${c.dimensionCode}`),
            sql`, `,
          )}]::text[],
          ARRAY[${sql.join(
            pinnedContexts.map((c) => sql`${c.valueCode as string}`),
            sql`, `,
          )}]::text[]
        )
      )
      UNION ALL
      SELECT child.id, child.dimension_code
      FROM catalog.context_value child
      JOIN pinned ON child.parent_value_id = pinned.id
    )
    SELECT a.id, a.state, a.context_key
    FROM learner.objective_assertion a
    WHERE a.learner_id = ${learnerId}
      AND a.objective_revision_id = ${objectiveRevisionId}
      AND NOT EXISTS (
        -- every pinned dimension must be matched by this assertion
        SELECT 1 FROM unnest(
          ARRAY[${sql.join(
            pinnedContexts.map((c) => sql`${c.dimensionCode}`),
            sql`, `,
          )}]::text[]
        ) AS required(dimension_code)
        WHERE NOT EXISTS (
          SELECT 1 FROM learner.objective_assertion_context ac
          JOIN pinned ON pinned.id = ac.context_value_id
          WHERE ac.assertion_id = a.id AND ac.dimension_code = required.dimension_code
        )
      )
  `);

  const demonstrated = assertionsResult.rows.filter((r) => r.state === "demonstrated");
  if (demonstrated.length === 0) {
    return {
      satisfied: false,
      via: null,
      reason:
        assertionsResult.rows.length === 0
          ? "no assertion in the required context"
          : "assertion exists in the required context but is not demonstrated",
    };
  }

  // Breadth: count distinct qualifying values on each dimension that demands it.
  for (const requirement of policy.contexts) {
    if (requirement.minimumDistinctValues <= 1) continue;
    const distinct = await db.execute(sql`
      SELECT count(DISTINCT ac.context_value_id) AS n
      FROM learner.objective_assertion a
      JOIN learner.objective_assertion_context ac ON ac.assertion_id = a.id
      WHERE a.learner_id = ${learnerId}
        AND a.objective_revision_id = ${objectiveRevisionId}
        AND a.state = 'demonstrated'
        AND ac.dimension_code = ${requirement.dimensionCode}
    `);
    if (Number(distinct.rows[0]?.n ?? 0) < requirement.minimumDistinctValues) {
      return {
        satisfied: false,
        via: null,
        reason: `requires evidence in ${requirement.minimumDistinctValues} distinct ${requirement.dimensionCode} values`,
      };
    }
  }

  const observations = await db.execute(sql`
    SELECT origin, independence_level, transfer_distance, performance_scope, observed_at
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
      policy.minimumTransferDistance !== null &&
      !transferDistanceAtLeast(
        String(row.transfer_distance) as TransferDistance,
        policy.minimumTransferDistance,
      )
    ) {
      continue;
    }
    if (
      policy.minimumPerformanceScope !== null &&
      !performanceScopeAtLeast(
        String(row.performance_scope) as PerformanceScope,
        policy.minimumPerformanceScope,
      )
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
    SELECT oreq.id, oreq.requirement_group_id, oreq.objective_revision_id,
           oreq.direct_evidence_required, oreq.proxy_evidence_allowed,
           oreq.minimum_independence, oreq.minimum_transfer_distance, oreq.minimum_performance_scope,
           oreq.maximum_evidence_age,
           lo.canonical_code
    FROM qualification.objective_requirement oreq
    JOIN catalog.learning_objective_revision lor ON lor.id = oreq.objective_revision_id
    JOIN catalog.learning_objective lo ON lo.id = lor.learning_objective_id
    JOIN qualification.requirement_group g ON g.id = oreq.requirement_group_id
    WHERE g.role_level_revision_id = ${roleLevelRevisionId}
    ORDER BY lo.canonical_code
  `);

  const contextRows = await db.execute(sql`
    SELECT orc.objective_requirement_id, orc.dimension_code, orc.minimum_distinct_values,
           cv.code AS value_code
    FROM qualification.objective_requirement_context orc
    LEFT JOIN catalog.context_value cv ON cv.id = orc.context_value_id
    JOIN qualification.objective_requirement oreq ON oreq.id = orc.objective_requirement_id
    JOIN qualification.requirement_group g ON g.id = oreq.requirement_group_id
    WHERE g.role_level_revision_id = ${roleLevelRevisionId}
  `);
  const contextsByRequirement = new Map<string, RequirementContextCheck[]>();
  for (const row of contextRows.rows) {
    const id = String(row.objective_requirement_id);
    const list = contextsByRequirement.get(id) ?? [];
    list.push({
      dimensionCode: String(row.dimension_code),
      valueCode: row.value_code === null ? null : String(row.value_code),
      minimumDistinctValues: Number(row.minimum_distinct_values),
    });
    contextsByRequirement.set(id, list);
  }

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
        minimumTransferDistance: (row.minimum_transfer_distance as TransferDistance | null) ?? null,
        minimumPerformanceScope: (row.minimum_performance_scope as PerformanceScope | null) ?? null,
        maximumEvidenceAge: row.maximum_evidence_age ? String(row.maximum_evidence_age) : null,
        contexts: contextsByRequirement.get(String(row.id)) ?? [],
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
