import { sql } from "drizzle-orm";
import type { Database } from "../client";
import * as s from "../schema/index";
import { frontierPolicy } from "./policy";

/**
 * Derived projections (spec §12.21, §15.6):
 * - hard-prerequisite dependency closure
 * - learner frontier (what to learn or prove next)
 */

export async function rebuildDependencyClosure(
  db: Database,
  frameworkReleaseId: string,
): Promise<number> {
  await db.execute(
    sql`DELETE FROM projection.objective_dependency_closure WHERE framework_release_id = ${frameworkReleaseId}`,
  );

  const inserted = await db.execute(sql`
    WITH RECURSIVE hard_edges AS (
      SELECT source_objective_revision_id AS ancestor,
             target_objective_revision_id AS descendant
      FROM catalog.objective_relationship
      WHERE framework_release_id = ${frameworkReleaseId}
        AND relationship_type = 'performance_requires'
        AND strength = 'hard'
        AND validation_status = 'approved'
    ),
    paths AS (
      SELECT ancestor, descendant, 1 AS depth FROM hard_edges
      UNION ALL
      SELECT p.ancestor, e.descendant, p.depth + 1
      FROM paths p
      JOIN hard_edges e ON e.ancestor = p.descendant
    )
    INSERT INTO projection.objective_dependency_closure (
      framework_release_id, ancestor_objective_revision_id,
      descendant_objective_revision_id, minimum_depth
    )
    SELECT ${frameworkReleaseId}, ancestor, descendant, min(depth)
    FROM paths
    GROUP BY ancestor, descendant
    RETURNING 1
  `);
  return inserted.rows.length;
}

export interface FrontierEntry {
  objectiveRevisionId: string;
  canonicalCode: string;
  title: string;
  masteryLevel: number;
  score: number;
  reasons: string[];
}

export interface FrontierResult {
  snapshotId: string;
  available: FrontierEntry[];
  blocked: Array<{ canonicalCode: string; blockedBy: string[] }>;
}

/**
 * §15.6: role-required objectives that are not demonstrated and whose hard
 * prerequisites are all demonstrated, ranked by unlock value and level.
 */
export async function computeFrontier(
  db: Database,
  learnerId: string,
  roleLevelRevisionId: string,
): Promise<FrontierResult> {
  const candidates = await db.execute(sql`
    WITH role_objectives AS (
      SELECT DISTINCT oreq.objective_revision_id
      FROM qualification.objective_requirement oreq
      JOIN qualification.requirement_group g ON g.id = oreq.requirement_group_id
      WHERE g.role_level_revision_id = ${roleLevelRevisionId}
    ),
    states AS (
      SELECT objective_revision_id, state
      FROM learner.objective_assertion
      WHERE learner_id = ${learnerId}
    )
    SELECT ro.objective_revision_id,
           lo.canonical_code,
           lor.title,
           lor.mastery_level,
           coalesce(st.state, 'unassessed') AS learner_state,
           (
             SELECT coalesce(json_agg(json_build_object(
               'code', plo.canonical_code,
               'state', coalesce(ps.state, 'unassessed')
             )), '[]'::json)
             FROM catalog.objective_relationship r
             JOIN catalog.learning_objective_revision plor ON plor.id = r.source_objective_revision_id
             JOIN catalog.learning_objective plo ON plo.id = plor.learning_objective_id
             LEFT JOIN learner.objective_assertion ps
               ON ps.learner_id = ${learnerId}
              AND ps.objective_revision_id = r.source_objective_revision_id
             WHERE r.target_objective_revision_id = ro.objective_revision_id
               AND r.relationship_type = 'performance_requires'
               AND r.strength = 'hard'
               AND r.validation_status = 'approved'
           ) AS hard_prerequisites,
           (
             SELECT count(*)
             FROM projection.objective_dependency_closure c
             JOIN role_objectives unlocks ON unlocks.objective_revision_id = c.descendant_objective_revision_id
             WHERE c.ancestor_objective_revision_id = ro.objective_revision_id
           ) AS unlock_count
    FROM role_objectives ro
    JOIN catalog.learning_objective_revision lor ON lor.id = ro.objective_revision_id
    JOIN catalog.learning_objective lo ON lo.id = lor.learning_objective_id
    LEFT JOIN states st ON st.objective_revision_id = ro.objective_revision_id
    WHERE coalesce(st.state, 'unassessed') <> 'demonstrated'
    ORDER BY lo.canonical_code
  `);

  const available: FrontierEntry[] = [];
  const blocked: FrontierResult["blocked"] = [];

  for (const row of candidates.rows) {
    const prerequisites = row.hard_prerequisites as Array<{ code: string; state: string }>;
    const unmet = prerequisites.filter((p) => p.state !== "demonstrated");

    if (unmet.length > 0) {
      blocked.push({
        canonicalCode: String(row.canonical_code),
        blockedBy: unmet.map((p) => p.code),
      });
      continue;
    }

    const reasons: string[] = ["role-required", "hard prerequisites satisfied"];
    let score =
      frontierPolicy.unlockWeight * Number(row.unlock_count) +
      frontierPolicy.levelWeight * (5 - Number(row.mastery_level));
    if (Number(row.unlock_count) > 0) {
      reasons.push(`unlocks ${row.unlock_count} downstream role objective(s)`);
    }
    if (row.learner_state === "developing") {
      score += frontierPolicy.developingBonus;
      reasons.push("already developing");
    }

    available.push({
      objectiveRevisionId: String(row.objective_revision_id),
      canonicalCode: String(row.canonical_code),
      title: String(row.title),
      masteryLevel: Number(row.mastery_level),
      score,
      reasons,
    });
  }

  available.sort((a, b) => b.score - a.score || a.canonicalCode.localeCompare(b.canonicalCode));

  const [snapshot] = await db
    .insert(s.frontierSnapshot)
    .values({ learnerId, roleLevelRevisionId })
    .returning({ id: s.frontierSnapshot.id });
  if (!snapshot) throw new Error("failed to insert frontier snapshot");

  for (const entry of available) {
    await db.insert(s.frontierItem).values({
      frontierSnapshotId: snapshot.id,
      objectiveRevisionId: entry.objectiveRevisionId,
      frontierScore: entry.score.toFixed(5),
      reasons: entry.reasons,
      recommendedAction: { type: "assess_or_learn", objective: entry.canonicalCode },
    });
  }

  return { snapshotId: snapshot.id, available, blocked };
}
