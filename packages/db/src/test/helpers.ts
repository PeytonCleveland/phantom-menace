import { sql } from "drizzle-orm";
import { expect } from "vitest";
import { createDb, type Database } from "../client";
import * as s from "../schema/index";
import {
  CatalogSession,
  createRelease,
  ensureFramework,
  type ObjectiveInput,
} from "../services/catalog";
import { TEST_DATABASE_URL } from "./global-setup";

export function withDb(): { db: Database; pool: { end: () => Promise<void> } } {
  return createDb(TEST_DATABASE_URL);
}

/**
 * pg errors surface through drizzle as `Error: Failed query: ...` with the
 * real database message on `.cause`. Assert against that, not the wrapper —
 * a bare `.rejects.toThrow(pattern)` would pass on any failure at all.
 *
 * The "did it reject at all" check and the "does the message match" check
 * are deliberately two separate steps, outside one another's catch: folding
 * them into a single try/catch means a query that unexpectedly SUCCEEDS
 * throws a synthetic "expected query to be rejected matching <pattern>"
 * error whose text echoes the pattern's own source — which a loose pattern
 * (e.g. /referenced.*frozen/) then matches against itself, reporting a false
 * pass for a query that never actually rejected.
 */
export async function expectRejectionMatching(
  query: Promise<unknown>,
  pattern: RegExp,
): Promise<void> {
  let message: string | undefined;
  try {
    await query;
  } catch (err) {
    const cause = err instanceof Error && err.cause instanceof Error ? err.cause : err;
    message = cause instanceof Error ? cause.message : String(cause);
  }
  if (message === undefined) {
    throw new Error(`expected query to be rejected matching ${pattern}, but it resolved`);
  }
  expect(message).toMatch(pattern);
}

export async function releaseId(db: Database): Promise<string> {
  const result = await db.execute(sql`
    SELECT fr.id FROM catalog.framework_release fr
    JOIN catalog.framework f ON f.id = fr.framework_id
    WHERE f.code = 'SWE' AND fr.version = '0.1.0'
  `);
  const id = result.rows[0]?.id;
  if (typeof id !== "string") throw new Error("seeded release SWE 0.1.0 not found");
  return id;
}

export async function seRoleLevelRevisionId(db: Database): Promise<string> {
  const result = await db.execute(sql`
    SELECT rlr.id FROM qualification.role_level_revision rlr
    JOIN qualification.role_level rl ON rl.id = rlr.role_level_id
    JOIN qualification.role r ON r.id = rl.role_id
    WHERE r.canonical_code = 'software-engineer' AND rl.level = 3 AND rlr.status = 'published'
  `);
  const id = result.rows[0]?.id;
  if (typeof id !== "string") throw new Error("published SE L3 role level revision not found");
  return id;
}

export async function objectiveId(db: Database, canonicalCode: string): Promise<string> {
  const result = await db.execute(sql`
    SELECT lor.id
    FROM catalog.learning_objective_revision lor
    JOIN catalog.learning_objective lo ON lo.id = lor.learning_objective_id
    WHERE lo.canonical_code = ${canonicalCode}
  `);
  const id = result.rows[0]?.id;
  if (typeof id !== "string") throw new Error(`objective ${canonicalCode} not found`);
  return id;
}

/** Each test creates its own learner so tests never contend over evidence. */
export async function createLearner(db: Database, label: string): Promise<string> {
  const [learner] = await db
    .insert(s.profile)
    .values({ displayName: label, externalSubjectId: `${label}-${crypto.randomUUID()}` })
    .returning({ id: s.profile.id });
  if (!learner) throw new Error("failed to create test learner");
  return learner.id;
}

export interface DraftObjectiveFixture {
  frameworkReleaseId: string;
  objectiveCode: string;
  objectiveRevisionId: string;
  cleanup: () => Promise<void>;
}

/**
 * Task 12 froze every objective-child table this pass introduced (criteria,
 * context policies, allowed values, claim-evidence constraints) the moment
 * their objective revision belongs to a published or retired framework
 * release — INSERT included, not just UPDATE/DELETE. Tests that need to
 * mutate one of those tables can no longer do it against seeded catalog
 * data (SWE 0.1.0 is published): they need an objective that lives in a
 * release of its own, which this never publishes, so its children stay
 * mutable and fully cleanable for the life of the fixture.
 */
export async function createDraftObjectiveFixture(
  db: Database,
  label: string,
  objectiveInput: Omit<ObjectiveInput, "code" | "primaryCompetencyCode">,
): Promise<DraftObjectiveFixture> {
  const suffix = crypto.randomUUID();
  const frameworkCode = `scratch-fw-${label}-${suffix}`;
  const domainCode = `scratch-domain-${label}-${suffix}`;
  const competencyCode = `scratch-competency-${label}-${suffix}`;
  const objectiveCode = `SCRATCH-OBJ-${label}-${suffix}`;

  const frameworkId = await ensureFramework(db, {
    code: frameworkCode,
    name: `Scratch framework (${label})`,
  });
  const frameworkReleaseId = await createRelease(db, {
    frameworkId,
    version: "0.0.1",
    notes: `Draft-only fixture for test "${label}"; never published.`,
  });

  const session = new CatalogSession(db, frameworkReleaseId);
  await session.createDomain({ code: domainCode, name: `Scratch domain (${label})` });
  await session.createCompetency({
    code: competencyCode,
    name: `Scratch competency (${label})`,
    primaryDomainCode: domainCode,
  });
  const objectiveRevisionId = await session.createObjective({
    ...objectiveInput,
    code: objectiveCode,
    primaryCompetencyCode: competencyCode,
  });

  return {
    frameworkReleaseId,
    objectiveCode,
    objectiveRevisionId,
    cleanup: async () => {
      // Nothing here ever left 'draft', so none of it is governed by any
      // published-immutability trigger and all of it can be deleted,
      // deepest-first.
      await db.execute(sql`
        DELETE FROM catalog.objective_context_allowed_value
        WHERE objective_revision_id = ${objectiveRevisionId}
      `);
      await db.execute(sql`
        DELETE FROM catalog.objective_context_policy
        WHERE objective_revision_id = ${objectiveRevisionId}
      `);
      await db.execute(sql`
        DELETE FROM catalog.objective_claim_evidence_constraint
        WHERE objective_revision_id = ${objectiveRevisionId}
      `);
      await db.execute(sql`
        DELETE FROM catalog.objective_criterion WHERE objective_revision_id = ${objectiveRevisionId}
      `);
      await db.execute(sql`
        DELETE FROM catalog.competency_objective_membership
        WHERE objective_revision_id = ${objectiveRevisionId}
      `);
      await db.execute(sql`
        DELETE FROM catalog.framework_release_objective
        WHERE objective_revision_id = ${objectiveRevisionId}
      `);
      await db.execute(sql`
        DELETE FROM catalog.learning_objective_revision WHERE id = ${objectiveRevisionId}
      `);
      await db.execute(sql`
        DELETE FROM catalog.learning_objective WHERE canonical_code = ${objectiveCode}
      `);
      await db.execute(sql`
        DELETE FROM catalog.domain_competency_membership
        WHERE competency_revision_id IN (
          SELECT cr.id FROM catalog.competency_revision cr
          JOIN catalog.competency c ON c.id = cr.competency_id
          WHERE c.canonical_code = ${competencyCode}
        )
      `);
      await db.execute(sql`
        DELETE FROM catalog.framework_release_competency frc
        USING catalog.competency_revision cr, catalog.competency c
        WHERE frc.competency_revision_id = cr.id
          AND cr.competency_id = c.id
          AND c.canonical_code = ${competencyCode}
      `);
      await db.execute(sql`
        DELETE FROM catalog.competency_revision cr
        USING catalog.competency c
        WHERE cr.competency_id = c.id AND c.canonical_code = ${competencyCode}
      `);
      await db.execute(
        sql`DELETE FROM catalog.competency WHERE canonical_code = ${competencyCode}`,
      );
      await db.execute(sql`
        DELETE FROM catalog.framework_release_domain frd
        USING catalog.domain_revision dr, catalog.domain d
        WHERE frd.domain_revision_id = dr.id AND dr.domain_id = d.id AND d.canonical_code = ${domainCode}
      `);
      await db.execute(sql`
        DELETE FROM catalog.domain_revision dr
        USING catalog.domain d
        WHERE dr.domain_id = d.id AND d.canonical_code = ${domainCode}
      `);
      await db.execute(sql`DELETE FROM catalog.domain WHERE canonical_code = ${domainCode}`);
      await db.execute(sql`DELETE FROM catalog.framework_release WHERE id = ${frameworkReleaseId}`);
      await db.execute(sql`DELETE FROM catalog.framework WHERE code = ${frameworkCode}`);
    },
  };
}
