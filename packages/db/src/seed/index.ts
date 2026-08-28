import "dotenv/config";
import { sql } from "drizzle-orm";
import { createDb } from "../client";
import * as s from "../schema/index";
import { createTask } from "../services/assessment";
import { CapabilitySetService } from "../services/capability-sets";
import { CatalogSession, createRelease, ensureFramework } from "../services/catalog";
import { ContextService } from "../services/context";
import { publishRelease } from "../services/publication";
import { RoleCompiler } from "../services/role-compiler";
import { cloudObjectives } from "./data/cloud";
import { competencies } from "./data/competencies";
import { contextDimensions, contextValues } from "./data/context";
import { domains } from "./data/domains";
import { objectives } from "./data/objectives";
import {
  competencyRelationships,
  evidenceImplications,
  objectiveRelationships,
} from "./data/relationships";
import { capabilitySets, softwareEngineerL3Composition, softwareEngineerRole } from "./data/roles";
import { rustAsyncDiagnosis, rustFramingChallenge } from "./data/tasks";
import { verbs } from "./data/verbs";

const FRAMEWORK_CODE = "SWE";
const RELEASE_VERSION = "0.1.0";

async function main(): Promise<void> {
  const connectionString =
    process.env.DATABASE_URL ?? "postgres://lighthouse:lighthouse@localhost:5432/lighthouse";
  const { db, pool } = createDb(connectionString);

  try {
    // Guard: this seed builds release 0.1.0 from scratch.
    const existing = await db.execute(
      sql`SELECT 1 FROM catalog.framework WHERE code = ${FRAMEWORK_CODE}`,
    );
    if (existing.rows.length > 0) {
      console.error(
        `framework ${FRAMEWORK_CODE} already exists — run \`pnpm db:reset\` from the repo root to reseed`,
      );
      process.exitCode = 1;
      return;
    }

    console.log("── Controlled verbs (§6.2)");
    for (const verb of verbs) {
      await db.insert(s.verbDefinition).values({
        code: verb.code,
        displayName: verb.displayName,
        definition: verb.definition,
        requiredElements: verb.requiredElements,
        doesNotEstablish: verb.doesNotEstablish,
        defaultEvidenceChannels: verb.defaultEvidenceChannels,
        allowedMasteryLevels: verb.allowedMasteryLevels,
      });
    }
    console.log(`   ${verbs.length} verbs`);

    console.log("── Framework and release");
    const frameworkId = await ensureFramework(db, {
      code: FRAMEWORK_CODE,
      name: "Software Engineering Framework",
      description: "Lighthouse capability model for software engineering roles.",
    });
    const releaseId = await createRelease(db, {
      frameworkId,
      version: RELEASE_VERSION,
      notes:
        "First seed release: full domain taxonomy plus the Networking / Rust Network I/O branch.",
    });
    console.log(`   ${FRAMEWORK_CODE} ${RELEASE_VERSION} (${releaseId})`);

    console.log("── Context dimensions");
    const contextService = new ContextService(db);
    for (const dimension of contextDimensions) await contextService.createDimension(dimension);
    for (const value of contextValues) await contextService.createValue(value);
    console.log(`   ${contextDimensions.length} dimensions, ${contextValues.length} values`);

    const session = new CatalogSession(db, releaseId);

    console.log("── Domains (§16, §17)");
    for (const [index, domain] of domains.entries()) {
      await session.createDomain({ ...domain, sortOrder: index });
    }
    console.log(`   ${domains.length} domains`);

    console.log("── Competencies");
    let sortOrder = 0;
    for (const competency of competencies) {
      await session.createCompetency({ ...competency, sortOrder: sortOrder++ });
    }
    console.log(`   ${competencies.length} competencies`);

    console.log("── Learning objectives (§18)");
    const allObjectives = [...objectives, ...cloudObjectives];
    for (const [index, objective] of allObjectives.entries()) {
      await session.createObjective({ ...objective, sortOrder: index });
    }
    console.log(`   ${allObjectives.length} objectives`);

    console.log("── Relationships and implications");
    for (const edge of competencyRelationships) {
      await session.createCompetencyRelationship(edge);
    }
    for (const edge of objectiveRelationships) {
      await session.createObjectiveRelationship(edge);
    }
    for (const implication of evidenceImplications) {
      await session.createEvidenceImplication(implication);
    }
    console.log(
      `   ${competencyRelationships.length} competency edges, ${objectiveRelationships.length} objective edges, ${evidenceImplications.length} implications`,
    );

    console.log("── Tasks and evidence contracts (§19)");
    const task = await createTask(db, releaseId, rustFramingChallenge, session.criterionIdByCode);
    console.log(
      `   ${rustFramingChallenge.code}: ${task.evidenceSpecIdByObjectiveCode.size} evidence specs, ` +
        `${task.variantIdByCode.size} variants, ${task.administrationIdByMode.size} administrations`,
    );
    const asyncTask = await createTask(
      db,
      releaseId,
      rustAsyncDiagnosis,
      session.criterionIdByCode,
    );
    console.log(
      `   ${rustAsyncDiagnosis.code}: ${asyncTask.evidenceSpecIdByObjectiveCode.size} evidence specs, ` +
        `${asyncTask.variantIdByCode.size} variants, ${asyncTask.administrationIdByMode.size} administrations`,
    );

    console.log("── Capability sets (§20)");
    const setService = new CapabilitySetService(db, releaseId);
    for (const set of capabilitySets) {
      await setService.createSet(set);
      await setService.publishSet(set.code);
    }
    console.log(`   ${capabilitySets.length} sets published`);

    console.log("── Software Engineer role (§9, §20)");
    const [role] = await db
      .insert(s.role)
      .values({
        canonicalCode: softwareEngineerRole.code,
        name: softwareEngineerRole.name,
        description: softwareEngineerRole.description,
      })
      .returning({ id: s.role.id });
    if (!role) throw new Error("failed to insert role");

    let l3RoleLevelId: string | undefined;
    for (const level of softwareEngineerRole.levels) {
      const [roleLevel] = await db
        .insert(s.roleLevel)
        .values({
          roleId: role.id,
          level: level.level,
          canonicalTitle: level.canonicalTitle,
        })
        .returning({ id: s.roleLevel.id });
      if (!roleLevel) throw new Error(`failed to insert role level ${level.level}`);
      if (level.level === 3) l3RoleLevelId = roleLevel.id;
    }
    if (!l3RoleLevelId) throw new Error("missing L3 role level");
    console.log("   role + 5 levels");

    console.log("── Compiling Software Engineer Level 3 (§21)");
    const compiler = new RoleCompiler(db);
    const compiled = await compiler.compileAndPublish({
      roleLevelId: l3RoleLevelId,
      frameworkReleaseId: releaseId,
      version: "1.0.0",
      title: "Software Engineer Level 3 — Independent / Team Ready",
      description: softwareEngineerRole.levels[2]?.expectation ?? "",
      groups: softwareEngineerL3Composition,
    });
    console.log(
      `   ${compiled.groupCount} groups, ${compiled.objectiveRequirementCount} frozen objective requirements`,
    );
    console.log(`   compiled hash ${compiled.compiledHash.slice(0, 16)}…`);

    console.log("── Publishing release (§13)");
    const publication = await publishRelease(db, releaseId);
    for (const warning of publication.warnings) {
      console.log(`   warning: ${warning}`);
    }
    console.log(`   ${FRAMEWORK_CODE} ${RELEASE_VERSION} published`);

    await printVerification(db, releaseId);
  } finally {
    await pool.end();
  }
}

async function printVerification(
  db: ReturnType<typeof createDb>["db"],
  releaseId: string,
): Promise<void> {
  console.log("\n═══ Verification ═══");

  const counts = await db.execute(sql`
    SELECT
      (SELECT count(*) FROM catalog.framework_release_domain WHERE framework_release_id = ${releaseId}) AS domains,
      (SELECT count(*) FROM catalog.framework_release_competency WHERE framework_release_id = ${releaseId}) AS competencies,
      (SELECT count(*) FROM catalog.framework_release_objective WHERE framework_release_id = ${releaseId}) AS objectives
  `);
  const c = counts.rows[0];
  console.log(
    `catalog: ${c?.domains} domains, ${c?.competencies} competencies, ${c?.objectives} objectives`,
  );

  const byLevel = await db.execute(sql`
    SELECT lor.mastery_level, count(*) AS n
    FROM catalog.framework_release_objective fro
    JOIN catalog.learning_objective_revision lor ON lor.id = fro.objective_revision_id
    WHERE fro.framework_release_id = ${releaseId}
    GROUP BY lor.mastery_level ORDER BY lor.mastery_level
  `);
  console.log(
    `objectives by level: ${byLevel.rows.map((r) => `L${r.mastery_level}=${r.n}`).join(" ")}`,
  );

  // §15.1 — direct prerequisites of RUST-NET-L3-001
  console.log("\n§15.1 What directly blocks RUST-NET-L3-001?");
  const prereqs = await db.execute(sql`
    SELECT src.canonical_code, r.strength
    FROM catalog.objective_relationship r
    JOIN catalog.learning_objective_revision slor ON slor.id = r.source_objective_revision_id
    JOIN catalog.learning_objective src ON src.id = slor.learning_objective_id
    JOIN catalog.learning_objective_revision tlor ON tlor.id = r.target_objective_revision_id
    JOIN catalog.learning_objective tgt ON tgt.id = tlor.learning_objective_id
    WHERE r.framework_release_id = ${releaseId}
      AND tgt.canonical_code = 'RUST-NET-L3-001'
      AND r.relationship_type = 'performance_requires'
      AND r.validation_status = 'approved'
  `);
  for (const row of prereqs.rows) {
    console.log(`  ${row.canonical_code} (${row.strength})`);
  }

  // §15.4 — why does Transport Protocols relate to Rust Network I/O?
  console.log("\n§15.4 Transport Protocols → Rust Network I/O");
  const crossDomain = await db.execute(sql`
    SELECT cr.relationship_type, cr.rationale,
      (
        SELECT count(*)
        FROM catalog.objective_relationship orel
        JOIN catalog.competency_objective_membership scom
          ON scom.objective_revision_id = orel.source_objective_revision_id
         AND scom.framework_release_id = orel.framework_release_id
         AND scom.membership_role = 'primary'
        JOIN catalog.competency_objective_membership tcom
          ON tcom.objective_revision_id = orel.target_objective_revision_id
         AND tcom.framework_release_id = orel.framework_release_id
         AND tcom.membership_role = 'primary'
        WHERE orel.framework_release_id = cr.framework_release_id
          AND scom.competency_revision_id = cr.source_competency_revision_id
          AND tcom.competency_revision_id = cr.target_competency_revision_id
      ) AS supporting_objective_edges
    FROM catalog.competency_relationship cr
    JOIN catalog.competency_revision scr ON scr.id = cr.source_competency_revision_id
    JOIN catalog.competency sc ON sc.id = scr.competency_id
    JOIN catalog.competency_revision tcr ON tcr.id = cr.target_competency_revision_id
    JOIN catalog.competency tc ON tc.id = tcr.competency_id
    WHERE cr.framework_release_id = ${releaseId}
      AND sc.canonical_code = 'networking.transport-protocols'
      AND tc.canonical_code = 'rust.network-io'
  `);
  for (const row of crossDomain.rows) {
    console.log(
      `  ${row.relationship_type}, ${row.supporting_objective_edges} supporting objective edges`,
    );
    console.log(`  rationale: ${row.rationale}`);
  }

  // Compiled role requirements summary
  console.log("\nSE Level 3 compiled requirement tree:");
  const tree = await db.execute(sql`
    SELECT g.label, g.operator, g.minimum_count,
      (SELECT count(*) FROM qualification.objective_requirement oreq WHERE oreq.requirement_group_id = g.id) AS requirements,
      (SELECT count(*) FROM qualification.objective_requirement oreq WHERE oreq.requirement_group_id = g.id AND oreq.direct_evidence_required) AS direct_required,
      (SELECT count(*) FROM qualification.objective_requirement oreq WHERE oreq.requirement_group_id = g.id AND oreq.source_capability_set_revision_id IS NOT NULL) AS from_sets
    FROM qualification.requirement_group g
    JOIN qualification.role_level_revision rlr ON rlr.id = g.role_level_revision_id
    WHERE rlr.framework_release_id = ${releaseId}
    ORDER BY g.sort_order NULLS LAST, g.label
  `);
  for (const row of tree.rows) {
    const nOf = row.minimum_count ? ` (n=${row.minimum_count})` : "";
    console.log(
      `  [${row.operator}${nOf}] ${row.label}: ${row.requirements} objectives` +
        `${Number(row.direct_required) > 0 ? `, ${row.direct_required} direct-evidence-required` : ""}` +
        `${Number(row.from_sets) > 0 ? `, ${row.from_sets} from capability sets` : ""}`,
    );
  }

  const hash = await db.execute(sql`
    SELECT rlr.title, rlr.status, rlr.metadata->>'compiledHash' AS hash
    FROM qualification.role_level_revision rlr
    WHERE rlr.framework_release_id = ${releaseId}
  `);
  for (const row of hash.rows) {
    console.log(`\n${row.title}\n  status=${row.status} hash=${String(row.hash).slice(0, 16)}…`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
