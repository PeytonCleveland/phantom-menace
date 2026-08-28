import { createHash } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import type { Database } from "../client";
import * as s from "../schema/index";

/**
 * Role publication compiler (spec §21).
 *
 * Takes an authored composition (requirement groups whose members are
 * capability sets or individual objectives), resolves everything against one
 * framework release, flattens nested sets, applies level filters, freezes
 * exact objective revisions with capability-set lineage, computes a
 * deterministic hash of the compiled requirement graph, and publishes an
 * immutable role-level revision.
 */

export interface ObjectivePolicy {
  directEvidenceRequired?: boolean;
  proxyEvidenceAllowed?: boolean;
  minimumIndependence?: 0 | 1 | 2 | 3 | 4;
  minimumTransfer?: (typeof s.transferLevelEnum.enumValues)[number];
}

export type RequirementMemberSpec =
  | {
      kind: "capability_set";
      setCode: string;
      /** Restrict resolved objectives to these mastery levels. */
      levelFilter?: number[];
      policy?: ObjectivePolicy;
    }
  | { kind: "objective"; objectiveCode: string; policy?: ObjectivePolicy };

export interface RequirementGroupSpec {
  label: string;
  operator: "all_of" | "any_of" | "n_of";
  minimumCount?: number;
  members?: RequirementMemberSpec[];
  children?: RequirementGroupSpec[];
}

export interface RoleLevelCompositionInput {
  roleLevelId: string;
  frameworkReleaseId: string;
  version: string;
  title: string;
  description: string;
  groups: RequirementGroupSpec[];
}

export interface CompiledRoleLevel {
  roleLevelRevisionId: string;
  compiledHash: string;
  objectiveRequirementCount: number;
  groupCount: number;
}

interface ResolvedObjective {
  objectiveRevisionId: string;
  canonicalCode: string;
  masteryLevel: number;
  sourceCapabilitySetRevisionId: string | null;
}

interface CompiledGroupNode {
  operator: string;
  minimumCount: number | null;
  label: string;
  requirements: Array<{
    objectiveRevisionId: string;
    canonicalCode: string;
    policy: Required<ObjectivePolicy>;
  }>;
  children: CompiledGroupNode[];
}

export class RoleCompiler {
  constructor(private readonly db: Database) {}

  async compileAndPublish(input: RoleLevelCompositionInput): Promise<CompiledRoleLevel> {
    let groupCount = 0;
    let requirementCount = 0;

    const revisionId = await this.db.transaction(async (tx) => {
      const [revision] = await tx
        .insert(s.roleLevelRevision)
        .values({
          roleLevelId: input.roleLevelId,
          frameworkReleaseId: input.frameworkReleaseId,
          version: input.version,
          title: input.title,
          description: input.description,
          status: "draft",
        })
        .returning({ id: s.roleLevelRevision.id });
      if (!revision) throw new Error("failed to insert role level revision");
      return revision.id;
    });

    const compiledTree: CompiledGroupNode[] = [];

    for (const groupSpec of input.groups) {
      const { node, groups, requirements } = await this.compileGroup(
        input.frameworkReleaseId,
        revisionId,
        null,
        groupSpec,
      );
      compiledTree.push(node);
      groupCount += groups;
      requirementCount += requirements;
    }

    const compiledHash = hashCompiledTree(compiledTree);

    await this.db
      .update(s.roleLevelRevision)
      .set({
        metadata: { compiledHash, compiledAt: new Date().toISOString() },
      })
      .where(eq(s.roleLevelRevision.id, revisionId));

    // Publish: freezes the revision via the governance trigger.
    await this.db
      .update(s.roleLevelRevision)
      .set({ status: "published", publishedAt: new Date() })
      .where(eq(s.roleLevelRevision.id, revisionId));

    return {
      roleLevelRevisionId: revisionId,
      compiledHash,
      objectiveRequirementCount: requirementCount,
      groupCount,
    };
  }

  private async compileGroup(
    frameworkReleaseId: string,
    roleLevelRevisionId: string,
    parentGroupId: string | null,
    spec: RequirementGroupSpec,
  ): Promise<{ node: CompiledGroupNode; groups: number; requirements: number }> {
    if (spec.operator === "n_of" && !spec.minimumCount) {
      throw new Error(`n_of group "${spec.label}" requires minimumCount`);
    }

    const [group] = await this.db
      .insert(s.requirementGroup)
      .values({
        roleLevelRevisionId,
        parentGroupId,
        operator: spec.operator,
        minimumCount: spec.operator === "n_of" ? spec.minimumCount : null,
        label: spec.label,
      })
      .returning({ id: s.requirementGroup.id });
    if (!group) throw new Error(`failed to insert requirement group "${spec.label}"`);

    let groupCount = 1;
    let requirementCount = 0;

    // Resolve members to exact objective revisions, dedup within the group.
    const resolved = new Map<string, { objective: ResolvedObjective; policy: ObjectivePolicy }>();

    for (const member of spec.members ?? []) {
      if (member.kind === "objective") {
        const objective = await this.resolveObjective(frameworkReleaseId, member.objectiveCode);
        if (!resolved.has(objective.objectiveRevisionId)) {
          resolved.set(objective.objectiveRevisionId, {
            objective,
            policy: member.policy ?? {},
          });
        }
      } else {
        const objectives = await this.resolveCapabilitySet(
          frameworkReleaseId,
          member.setCode,
          member.levelFilter,
        );
        for (const objective of objectives) {
          if (!resolved.has(objective.objectiveRevisionId)) {
            resolved.set(objective.objectiveRevisionId, {
              objective,
              policy: member.policy ?? {},
            });
          }
        }
      }
    }

    const nodeRequirements: CompiledGroupNode["requirements"] = [];

    for (const { objective, policy } of resolved.values()) {
      const fullPolicy: Required<ObjectivePolicy> = {
        directEvidenceRequired: policy.directEvidenceRequired ?? false,
        proxyEvidenceAllowed: policy.proxyEvidenceAllowed ?? true,
        minimumIndependence: policy.minimumIndependence ?? 3,
        minimumTransfer: policy.minimumTransfer ?? "near",
      };

      await this.db.insert(s.objectiveRequirement).values({
        requirementGroupId: group.id,
        objectiveRevisionId: objective.objectiveRevisionId,
        sourceCapabilitySetRevisionId: objective.sourceCapabilitySetRevisionId,
        directEvidenceRequired: fullPolicy.directEvidenceRequired,
        proxyEvidenceAllowed: fullPolicy.proxyEvidenceAllowed,
        minimumIndependence: fullPolicy.minimumIndependence,
        minimumTransfer: fullPolicy.minimumTransfer,
      });

      nodeRequirements.push({
        objectiveRevisionId: objective.objectiveRevisionId,
        canonicalCode: objective.canonicalCode,
        policy: fullPolicy,
      });
      requirementCount += 1;
    }

    nodeRequirements.sort((a, b) => a.canonicalCode.localeCompare(b.canonicalCode));

    const childNodes: CompiledGroupNode[] = [];
    for (const childSpec of spec.children ?? []) {
      const child = await this.compileGroup(
        frameworkReleaseId,
        roleLevelRevisionId,
        group.id,
        childSpec,
      );
      childNodes.push(child.node);
      groupCount += child.groups;
      requirementCount += child.requirements;
    }

    // §21: no impossible n_of group
    const satisfiable = nodeRequirements.length + childNodes.length;
    if (spec.operator === "n_of" && (spec.minimumCount ?? 0) > satisfiable) {
      throw new Error(
        `n_of group "${spec.label}" requires ${spec.minimumCount} of ${satisfiable} members`,
      );
    }
    if (satisfiable === 0) {
      throw new Error(`requirement group "${spec.label}" resolved to zero members`);
    }

    return {
      node: {
        operator: spec.operator,
        minimumCount: spec.operator === "n_of" ? (spec.minimumCount ?? null) : null,
        label: spec.label,
        requirements: nodeRequirements,
        children: childNodes,
      },
      groups: groupCount,
      requirements: requirementCount,
    };
  }

  private async resolveObjective(
    frameworkReleaseId: string,
    canonicalCode: string,
  ): Promise<ResolvedObjective> {
    const result = await this.db.execute(sql`
      SELECT lor.id, lo.canonical_code, lor.mastery_level
      FROM catalog.learning_objective_revision lor
      JOIN catalog.learning_objective lo ON lo.id = lor.learning_objective_id
      JOIN catalog.framework_release_objective fro ON fro.objective_revision_id = lor.id
      WHERE lo.canonical_code = ${canonicalCode}
        AND fro.framework_release_id = ${frameworkReleaseId}
    `);
    const row = result.rows[0];
    if (!row) throw new Error(`objective ${canonicalCode} not found in release`);
    return {
      objectiveRevisionId: row.id as string,
      canonicalCode: row.canonical_code as string,
      masteryLevel: Number(row.mastery_level),
      sourceCapabilitySetRevisionId: null,
    };
  }

  /**
   * Resolve a capability set to exact objective revisions:
   * direct objective members, competency members (objectives whose primary
   * placement is that competency, filtered by selection_filter.levels), and
   * nested sets flattened recursively. Lineage points at the set the
   * objective was found in.
   */
  private async resolveCapabilitySet(
    frameworkReleaseId: string,
    setCode: string,
    levelFilter?: number[],
  ): Promise<ResolvedObjective[]> {
    const setResult = await this.db.execute(sql`
      SELECT csr.id
      FROM catalog.capability_set_revision csr
      JOIN catalog.capability_set cs ON cs.id = csr.capability_set_id
      WHERE cs.canonical_code = ${setCode}
        AND csr.framework_release_id = ${frameworkReleaseId}
        AND csr.status = 'published'
    `);
    const setRevisionId = setResult.rows[0]?.id;
    if (typeof setRevisionId !== "string") {
      throw new Error(`published capability set ${setCode} not found in release`);
    }

    const collected = new Map<string, ResolvedObjective>();
    await this.collectSetObjectives(frameworkReleaseId, setRevisionId, collected);

    let objectives = [...collected.values()];
    if (levelFilter && levelFilter.length > 0) {
      objectives = objectives.filter((o) => levelFilter.includes(o.masteryLevel));
    }
    return objectives;
  }

  private async collectSetObjectives(
    frameworkReleaseId: string,
    setRevisionId: string,
    collected: Map<string, ResolvedObjective>,
  ): Promise<void> {
    // Direct objective members
    const direct = await this.db.execute(sql`
      SELECT lor.id, lo.canonical_code, lor.mastery_level
      FROM catalog.capability_set_objective_member m
      JOIN catalog.learning_objective_revision lor ON lor.id = m.objective_revision_id
      JOIN catalog.learning_objective lo ON lo.id = lor.learning_objective_id
      WHERE m.capability_set_revision_id = ${setRevisionId}
    `);
    for (const row of direct.rows) {
      const id = row.id as string;
      if (!collected.has(id)) {
        collected.set(id, {
          objectiveRevisionId: id,
          canonicalCode: row.canonical_code as string,
          masteryLevel: Number(row.mastery_level),
          sourceCapabilitySetRevisionId: setRevisionId,
        });
      }
    }

    // Competency members: objectives with primary placement in the competency,
    // filtered by the member's selection_filter.levels when present.
    const viaCompetency = await this.db.execute(sql`
      SELECT lor.id, lo.canonical_code, lor.mastery_level
      FROM catalog.capability_set_competency_member m
      JOIN catalog.competency_objective_membership com
        ON com.competency_revision_id = m.competency_revision_id
       AND com.framework_release_id = ${frameworkReleaseId}
       AND com.membership_role = 'primary'
      JOIN catalog.learning_objective_revision lor ON lor.id = com.objective_revision_id
      JOIN catalog.learning_objective lo ON lo.id = lor.learning_objective_id
      WHERE m.capability_set_revision_id = ${setRevisionId}
        AND (
          NOT (m.selection_filter ? 'levels')
          OR m.selection_filter->'levels' @> to_jsonb(lor.mastery_level)
        )
    `);
    for (const row of viaCompetency.rows) {
      const id = row.id as string;
      if (!collected.has(id)) {
        collected.set(id, {
          objectiveRevisionId: id,
          canonicalCode: row.canonical_code as string,
          masteryLevel: Number(row.mastery_level),
          sourceCapabilitySetRevisionId: setRevisionId,
        });
      }
    }

    // Nested sets (acyclicity is DB-enforced)
    const nested = await this.db.execute(sql`
      SELECT child_capability_set_revision_id AS id
      FROM catalog.capability_set_nested_member
      WHERE parent_capability_set_revision_id = ${setRevisionId}
    `);
    for (const row of nested.rows) {
      await this.collectSetObjectives(frameworkReleaseId, row.id as string, collected);
    }
  }
}

function hashCompiledTree(tree: CompiledGroupNode[]): string {
  const canonical = JSON.stringify(tree, (_key, value) => {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)),
      );
    }
    return value;
  });
  return createHash("sha256").update(canonical).digest("hex");
}
