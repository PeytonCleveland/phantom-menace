import { and, eq } from "drizzle-orm";
import type { Database } from "../client";
import * as s from "../schema/index";

/**
 * Catalog write helpers.
 *
 * Every "create" encapsulates the stable-identity + immutable-revision pattern
 * (spec §11): insert the identity row, insert revision 1, attach the revision
 * to a framework release, and record primary placement — so callers never
 * hand-manage revision bookkeeping. These helpers are the seed of the service
 * layer a future authoring UI will call.
 */

export interface DomainInput {
  code: string;
  name: string;
  description?: string;
  sortOrder?: number;
}

export interface CompetencyInput {
  code: string;
  name: string;
  description?: string;
  outcomeStatement?: string;
  /** Canonical code of the primary domain. */
  primaryDomainCode: string;
  sortOrder?: number;
}

export interface CriterionInput {
  code: string;
  statement: string;
  kind: "success" | "quality" | "verification" | "process" | "critical_error";
}

export interface ObjectiveInput {
  code: string;
  title: string;
  statement: string;
  masteryLevel: 1 | 2 | 3 | 4 | 5;
  verbCode: string;
  assuranceClass: "A" | "B" | "C";
  performanceObject?: string;
  conditions?: Record<string, unknown>;
  successCriteria: string[];
  criticalErrors?: string[];
  tags?: string[];
  /** Canonical code of the primary competency. */
  primaryCompetencyCode: string;
  sortOrder?: number;
  criteria: CriterionInput[];
}

export interface ObjectiveRelationshipInput {
  sourceCode: string;
  targetCode: string;
  relationshipType: (typeof s.objectiveRelationshipTypeEnum.enumValues)[number];
  strength: (typeof s.relationshipStrengthEnum.enumValues)[number];
  rationale: string;
  provenance?: (typeof s.relationshipProvenanceEnum.enumValues)[number];
  validationStatus?: (typeof s.validationStatusEnum.enumValues)[number];
}

export interface CompetencyRelationshipInput {
  sourceCode: string;
  targetCode: string;
  relationshipType: (typeof s.competencyRelationshipTypeEnum.enumValues)[number];
  rationale: string;
  provenance?: (typeof s.relationshipProvenanceEnum.enumValues)[number];
  validationStatus?: (typeof s.validationStatusEnum.enumValues)[number];
}

export interface EvidenceImplicationInput {
  sourceCode: string;
  targetCode: string;
  implicationType: (typeof s.evidenceImplicationTypeEnum.enumValues)[number];
  derivedEvidenceStrength: (typeof s.evidenceStrengthEnum.enumValues)[number];
  maximumTargetState: "developing" | "demonstrated";
  requiredObservableCodes?: string[];
  requiredCriterionCodes?: string[];
  automatic?: boolean;
  transitive?: boolean;
  rationale: string;
  validationStatus?: (typeof s.validationStatusEnum.enumValues)[number];
}

/**
 * A release-scoped catalog session. Caches canonical-code -> revision-id maps
 * so relationship and membership writes resolve codes without extra queries.
 */
export class CatalogSession {
  readonly domainRevisionByCode = new Map<string, string>();
  readonly competencyRevisionByCode = new Map<string, string>();
  readonly objectiveRevisionByCode = new Map<string, string>();
  /** "<objectiveCode>:<criterionCode>" -> objective_criterion.id */
  readonly criterionIdByCode = new Map<string, string>();

  constructor(
    private readonly db: Database,
    readonly frameworkReleaseId: string,
  ) {}

  async createDomain(input: DomainInput): Promise<string> {
    const revisionId = await this.db.transaction(async (tx) => {
      const [identity] = await tx
        .insert(s.domain)
        .values({ canonicalCode: input.code })
        .returning({ id: s.domain.id });
      if (!identity) throw new Error(`failed to insert domain ${input.code}`);

      const [revision] = await tx
        .insert(s.domainRevision)
        .values({
          domainId: identity.id,
          revisionNo: 1,
          name: input.name,
          description: input.description ?? "",
        })
        .returning({ id: s.domainRevision.id });
      if (!revision) throw new Error(`failed to insert domain revision ${input.code}`);

      await tx.insert(s.frameworkReleaseDomain).values({
        frameworkReleaseId: this.frameworkReleaseId,
        domainRevisionId: revision.id,
        sortOrder: input.sortOrder,
      });

      return revision.id;
    });

    this.domainRevisionByCode.set(input.code, revisionId);
    return revisionId;
  }

  async createCompetency(input: CompetencyInput): Promise<string> {
    const domainRevisionId = this.requireDomain(input.primaryDomainCode);

    const revisionId = await this.db.transaction(async (tx) => {
      const [identity] = await tx
        .insert(s.competency)
        .values({ canonicalCode: input.code })
        .returning({ id: s.competency.id });
      if (!identity) throw new Error(`failed to insert competency ${input.code}`);

      const [revision] = await tx
        .insert(s.competencyRevision)
        .values({
          competencyId: identity.id,
          revisionNo: 1,
          name: input.name,
          description: input.description ?? "",
          outcomeStatement: input.outcomeStatement ?? "",
        })
        .returning({ id: s.competencyRevision.id });
      if (!revision) throw new Error(`failed to insert competency revision ${input.code}`);

      await tx.insert(s.frameworkReleaseCompetency).values({
        frameworkReleaseId: this.frameworkReleaseId,
        competencyRevisionId: revision.id,
      });

      await tx.insert(s.domainCompetencyMembership).values({
        frameworkReleaseId: this.frameworkReleaseId,
        domainRevisionId,
        competencyRevisionId: revision.id,
        membershipRole: "primary",
        sortOrder: input.sortOrder,
      });

      return revision.id;
    });

    this.competencyRevisionByCode.set(input.code, revisionId);
    return revisionId;
  }

  async createObjective(input: ObjectiveInput): Promise<string> {
    const competencyRevisionId = this.requireCompetency(input.primaryCompetencyCode);
    const criterionIds: Array<[string, string]> = [];

    const revisionId = await this.db.transaction(async (tx) => {
      const [identity] = await tx
        .insert(s.learningObjective)
        .values({ canonicalCode: input.code })
        .returning({ id: s.learningObjective.id });
      if (!identity) throw new Error(`failed to insert objective ${input.code}`);

      const [revision] = await tx
        .insert(s.learningObjectiveRevision)
        .values({
          learningObjectiveId: identity.id,
          revisionNo: 1,
          title: input.title,
          statement: input.statement,
          masteryLevel: input.masteryLevel,
          verbCode: input.verbCode,
          assuranceClass: input.assuranceClass,
          performanceObject: input.performanceObject ?? "",
          conditions: input.conditions ?? {},
          successCriteria: input.successCriteria,
          criticalErrors: input.criticalErrors ?? [],
          tags: input.tags ?? [],
        })
        .returning({ id: s.learningObjectiveRevision.id });
      if (!revision) throw new Error(`failed to insert objective revision ${input.code}`);

      await tx.insert(s.frameworkReleaseObjective).values({
        frameworkReleaseId: this.frameworkReleaseId,
        objectiveRevisionId: revision.id,
      });

      await tx.insert(s.competencyObjectiveMembership).values({
        frameworkReleaseId: this.frameworkReleaseId,
        competencyRevisionId,
        objectiveRevisionId: revision.id,
        membershipRole: "primary",
        sortOrder: input.sortOrder,
      });

      for (const [index, criterion] of (input.criteria ?? []).entries()) {
        const [created] = await tx
          .insert(s.objectiveCriterion)
          .values({
            objectiveRevisionId: revision.id,
            code: criterion.code,
            statement: criterion.statement,
            kind: criterion.kind,
            sortOrder: index,
          })
          .returning({ id: s.objectiveCriterion.id });
        if (!created) throw new Error(`failed to insert criterion ${criterion.code}`);
        criterionIds.push([`${input.code}:${criterion.code}`, created.id]);
      }

      return revision.id;
    });

    this.objectiveRevisionByCode.set(input.code, revisionId);
    for (const [key, id] of criterionIds) this.criterionIdByCode.set(key, id);
    return revisionId;
  }

  async createObjectiveRelationship(input: ObjectiveRelationshipInput): Promise<void> {
    await this.db.insert(s.objectiveRelationship).values({
      frameworkReleaseId: this.frameworkReleaseId,
      sourceObjectiveRevisionId: this.requireObjective(input.sourceCode),
      targetObjectiveRevisionId: this.requireObjective(input.targetCode),
      relationshipType: input.relationshipType,
      strength: input.strength,
      rationale: input.rationale,
      provenance: input.provenance ?? "sme",
      validationStatus: input.validationStatus ?? "approved",
    });
  }

  async createCompetencyRelationship(input: CompetencyRelationshipInput): Promise<void> {
    await this.db.insert(s.competencyRelationship).values({
      frameworkReleaseId: this.frameworkReleaseId,
      sourceCompetencyRevisionId: this.requireCompetency(input.sourceCode),
      targetCompetencyRevisionId: this.requireCompetency(input.targetCode),
      relationshipType: input.relationshipType,
      rationale: input.rationale,
      provenance: input.provenance ?? "sme",
      validationStatus: input.validationStatus ?? "approved",
    });
  }

  async createEvidenceImplication(input: EvidenceImplicationInput): Promise<void> {
    const [created] = await this.db
      .insert(s.objectiveEvidenceImplication)
      .values({
        frameworkReleaseId: this.frameworkReleaseId,
        sourceObjectiveRevisionId: this.requireObjective(input.sourceCode),
        targetObjectiveRevisionId: this.requireObjective(input.targetCode),
        implicationType: input.implicationType,
        derivedEvidenceStrength: input.derivedEvidenceStrength,
        maximumTargetState: input.maximumTargetState,
        requiredObservableCodes: input.requiredObservableCodes ?? [],
        automatic: input.automatic ?? false,
        transitive: input.transitive ?? false,
        rationale: input.rationale,
        validationStatus: input.validationStatus ?? "approved",
      })
      .returning({ id: s.objectiveEvidenceImplication.id });
    if (!created) throw new Error(`failed to insert implication ${input.sourceCode}`);

    // Required criteria always belong to the SOURCE objective — they describe
    // what the source assessment established, not what the target claims.
    for (const criterionCode of input.requiredCriterionCodes ?? []) {
      await this.db.insert(s.objectiveEvidenceImplicationCriterion).values({
        implicationId: created.id,
        objectiveCriterionId: this.requireCriterion(input.sourceCode, criterionCode),
      });
    }
  }

  requireCriterion(objectiveCode: string, criterionCode: string): string {
    const id = this.criterionIdByCode.get(`${objectiveCode}:${criterionCode}`);
    if (!id) throw new Error(`unknown criterion ${objectiveCode}:${criterionCode}`);
    return id;
  }

  requireDomain(code: string): string {
    const id = this.domainRevisionByCode.get(code);
    if (!id) throw new Error(`unknown domain code in this release: ${code}`);
    return id;
  }

  requireCompetency(code: string): string {
    const id = this.competencyRevisionByCode.get(code);
    if (!id) throw new Error(`unknown competency code in this release: ${code}`);
    return id;
  }

  requireObjective(code: string): string {
    const id = this.objectiveRevisionByCode.get(code);
    if (!id) throw new Error(`unknown objective code in this release: ${code}`);
    return id;
  }
}

export async function ensureFramework(
  db: Database,
  input: { code: string; name: string; description?: string },
): Promise<string> {
  const existing = await db
    .select({ id: s.framework.id })
    .from(s.framework)
    .where(eq(s.framework.code, input.code));
  const first = existing[0];
  if (first) return first.id;

  const [created] = await db
    .insert(s.framework)
    .values({ code: input.code, name: input.name, description: input.description ?? "" })
    .returning({ id: s.framework.id });
  if (!created) throw new Error(`failed to insert framework ${input.code}`);
  return created.id;
}

export async function createRelease(
  db: Database,
  input: { frameworkId: string; version: string; notes?: string },
): Promise<string> {
  const [release] = await db
    .insert(s.frameworkRelease)
    .values({
      frameworkId: input.frameworkId,
      version: input.version,
      notes: input.notes ?? "",
    })
    .returning({ id: s.frameworkRelease.id });
  if (!release) throw new Error(`failed to insert release ${input.version}`);
  return release.id;
}

export async function findRelease(
  db: Database,
  frameworkCode: string,
  version: string,
): Promise<string | undefined> {
  const rows = await db
    .select({ id: s.frameworkRelease.id })
    .from(s.frameworkRelease)
    .innerJoin(s.framework, eq(s.framework.id, s.frameworkRelease.frameworkId))
    .where(and(eq(s.framework.code, frameworkCode), eq(s.frameworkRelease.version, version)));
  return rows[0]?.id;
}
