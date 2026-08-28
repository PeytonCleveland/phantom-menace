import { sql } from "drizzle-orm";
import { createDb, type Database } from "../client";
import * as s from "../schema/index";
import { TEST_DATABASE_URL } from "./global-setup";

export function withDb(): { db: Database; pool: { end: () => Promise<void> } } {
  return createDb(TEST_DATABASE_URL);
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
