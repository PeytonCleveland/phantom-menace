import { eq, sql } from "drizzle-orm";
import type { Database } from "../client";
import * as s from "../schema/index";

/**
 * Capability sets (spec §4.5, §12.12): reusable authoring collections.
 * Sets are conveniences — published role profiles must resolve them to exact
 * objective revisions (done by the role compiler).
 */

export interface CompetencyMemberInput {
  competencyCode: string;
  /** Optional mastery-level filter stored in selection_filter. */
  levels?: number[];
}

export interface CapabilitySetInput {
  code: string;
  name: string;
  description?: string;
  objectiveCodes?: string[];
  competencyMembers?: CompetencyMemberInput[];
  nestedSetCodes?: string[];
}

export class CapabilitySetService {
  /** canonical set code -> capability_set_revision id */
  readonly revisionByCode = new Map<string, string>();

  constructor(
    private readonly db: Database,
    private readonly frameworkReleaseId: string,
  ) {}

  async createSet(input: CapabilitySetInput): Promise<string> {
    const revisionId = await this.db.transaction(async (tx) => {
      const [identity] = await tx
        .insert(s.capabilitySet)
        .values({ canonicalCode: input.code })
        .returning({ id: s.capabilitySet.id });
      if (!identity) throw new Error(`failed to insert capability set ${input.code}`);

      const [revision] = await tx
        .insert(s.capabilitySetRevision)
        .values({
          capabilitySetId: identity.id,
          frameworkReleaseId: this.frameworkReleaseId,
          revisionNo: 1,
          name: input.name,
          description: input.description ?? "",
        })
        .returning({ id: s.capabilitySetRevision.id });
      if (!revision) throw new Error(`failed to insert capability set revision ${input.code}`);

      for (const objectiveCode of input.objectiveCodes ?? []) {
        const objectiveRevisionId = await this.resolveObjectiveRevision(objectiveCode);
        await tx.insert(s.capabilitySetObjectiveMember).values({
          capabilitySetRevisionId: revision.id,
          objectiveRevisionId,
        });
      }

      for (const member of input.competencyMembers ?? []) {
        const competencyRevisionId = await this.resolveCompetencyRevision(member.competencyCode);
        await tx.insert(s.capabilitySetCompetencyMember).values({
          capabilitySetRevisionId: revision.id,
          competencyRevisionId,
          selectionFilter: member.levels ? { levels: member.levels } : {},
        });
      }

      for (const nestedCode of input.nestedSetCodes ?? []) {
        const childRevisionId = this.revisionByCode.get(nestedCode);
        if (!childRevisionId) {
          throw new Error(`nested capability set ${nestedCode} must be created first`);
        }
        await tx.insert(s.capabilitySetNestedMember).values({
          parentCapabilitySetRevisionId: revision.id,
          childCapabilitySetRevisionId: childRevisionId,
        });
      }

      return revision.id;
    });

    this.revisionByCode.set(input.code, revisionId);
    return revisionId;
  }

  async publishSet(setCode: string): Promise<void> {
    const revisionId = this.revisionByCode.get(setCode);
    if (!revisionId) throw new Error(`unknown capability set: ${setCode}`);
    await this.db
      .update(s.capabilitySetRevision)
      .set({ status: "published", publishedAt: new Date() })
      .where(eq(s.capabilitySetRevision.id, revisionId));
  }

  private async resolveObjectiveRevision(canonicalCode: string): Promise<string> {
    const result = await this.db.execute(sql`
      SELECT lor.id
      FROM catalog.learning_objective_revision lor
      JOIN catalog.learning_objective lo ON lo.id = lor.learning_objective_id
      JOIN catalog.framework_release_objective fro ON fro.objective_revision_id = lor.id
      WHERE lo.canonical_code = ${canonicalCode}
        AND fro.framework_release_id = ${this.frameworkReleaseId}
    `);
    const id = result.rows[0]?.id;
    if (typeof id !== "string") {
      throw new Error(`objective ${canonicalCode} not found in release`);
    }
    return id;
  }

  private async resolveCompetencyRevision(canonicalCode: string): Promise<string> {
    const result = await this.db.execute(sql`
      SELECT cr.id
      FROM catalog.competency_revision cr
      JOIN catalog.competency c ON c.id = cr.competency_id
      JOIN catalog.framework_release_competency frc ON frc.competency_revision_id = cr.id
      WHERE c.canonical_code = ${canonicalCode}
        AND frc.framework_release_id = ${this.frameworkReleaseId}
    `);
    const id = result.rows[0]?.id;
    if (typeof id !== "string") {
      throw new Error(`competency ${canonicalCode} not found in release`);
    }
    return id;
  }
}
