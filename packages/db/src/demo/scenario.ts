import "dotenv/config";
import { sql } from "drizzle-orm";
import { createDb, type Database } from "../client";
import * as s from "../schema/index";
import { recalculateForObservations } from "../services/assertions";
import { propagateFromObservation, recordObservation } from "../services/evidence";
import { computeFrontier, rebuildDependencyClosure } from "../services/projections";
import {
  checkObjectiveSatisfaction,
  evaluateRoleState,
  type GroupEvaluation,
} from "../services/role-state";

/**
 * Minimum demonstration scenario (spec §25, steps 8–14).
 * Assumes `pnpm db:reset` (or migrate + seed) has run: release 0.1.0 with the
 * Networking / Rust branch, the framing challenge task, and the compiled
 * Software Engineer Level 3 profile.
 */

async function main(): Promise<void> {
  const connectionString =
    process.env.DATABASE_URL ?? "postgres://lighthouse:lighthouse@localhost:5432/lighthouse";
  const { db, pool } = createDb(connectionString);

  try {
    const ctx = await loadContext(db);

    console.log("═══ Lighthouse demonstration scenario (§25) ═══\n");

    // ── Learner ────────────────────────────────────────────────────────────
    const [learner] = await db
      .insert(s.profile)
      .values({
        displayName: "A1C Demo Learner",
        externalSubjectId: `demo-learner-${Date.now()}`,
      })
      .returning({ id: s.profile.id });
    if (!learner) throw new Error("failed to create learner");
    console.log(`learner: A1C Demo Learner (${learner.id})\n`);

    await rebuildDependencyClosure(db, ctx.releaseId);

    // ── Frontier BEFORE any evidence ───────────────────────────────────────
    console.log("── Frontier before any evidence (§15.6)");
    const before = await computeFrontier(db, learner.id, ctx.roleLevelRevisionId);
    const beforeAvailable = new Set(before.available.map((e) => e.canonicalCode));
    console.log(`   available: ${before.available.length}, blocked: ${before.blocked.length}`);
    for (const b of before.blocked) {
      console.log(`   blocked: ${b.canonicalCode} ← ${b.blockedBy.join(", ")}`);
    }

    // ── Step: knowledge-check evidence unlocks a blocked objective ────────
    console.log("\n── Knowledge check: NET-TCP-L1-004 (predict partial reads)");
    const knowledgeCheck = await recordObservation(db, {
      learnerId: learner.id,
      objectiveRevisionId: ctx.objective("NET-TCP-L1-004"),
      result: "successful",
      evidenceStrength: "direct",
      independenceLevel: 4,
      transferLevel: "near",
      machineVerified: true,
      details: { source: "adaptive knowledge check" },
    });
    await recalculateForObservations(db, [knowledgeCheck]);

    const mid = await computeFrontier(db, learner.id, ctx.roleLevelRevisionId);
    const newlyUnlocked = mid.available.filter((e) => !beforeAvailable.has(e.canonicalCode));
    console.log(
      `   §25.13 newly unlocked on frontier: ${newlyUnlocked.map((e) => e.canonicalCode).join(", ") || "none"}`,
    );

    // ── Steps 8–9: mission attempt, direct evidence, proxy propagation ────
    console.log("\n── Qualification attempt: Rust framing challenge (§19)");
    const [attempt] = await db
      .insert(s.learnerAttempt)
      .values({
        learnerId: learner.id,
        taskAdministrationId: ctx.qualificationAdministrationId,
        attemptStatus: "completed",
        submittedAt: new Date(),
        completedAt: new Date(),
        resultSummary: { hiddenBoundaryTests: "passed", ci: "green" },
      })
      .returning({ id: s.learnerAttempt.id });
    if (!attempt) throw new Error("failed to create attempt");

    const observableResults = [
      "framing-model",
      "buffer-preservation",
      "multiple-frames",
      "partial-header",
      "partial-body",
      "eof",
      "io-error",
      "verification",
      "data-integrity",
    ].map((code) => ({ code, result: "successful" as const }));

    const directEvidence = await recordObservation(db, {
      learnerId: learner.id,
      attemptId: attempt.id,
      objectiveRevisionId: ctx.objective("RUST-NET-L3-001"),
      evidenceSpecId: ctx.evidenceSpec("RUST-NET-L3-001"),
      result: "successful",
      evidenceStrength: "direct",
      independenceLevel: 3,
      transferLevel: "near",
      rubricScore: 0.92,
      machineVerified: true,
      details: { administration: "qualification", variant: "variant-split-header" },
      observableResults,
    });
    console.log(`   §25.8 direct evidence recorded for RUST-NET-L3-001 (${directEvidence})`);

    // Supporting observations per the task's evidence specs.
    const supportingIds: string[] = [];
    for (const code of ["RUST-NET-L2-004", "NET-TCP-L1-003"]) {
      supportingIds.push(
        await recordObservation(db, {
          learnerId: learner.id,
          attemptId: attempt.id,
          objectiveRevisionId: ctx.objective(code),
          evidenceSpecId: ctx.evidenceSpec(code),
          result: "successful",
          evidenceStrength: "supporting",
          independenceLevel: 3,
          transferLevel: "near",
          machineVerified: true,
        }),
      );
    }

    const propagation = await propagateFromObservation(db, directEvidence);
    console.log(
      `   §25.9 proxy propagation: ${propagation.createdProxyObservationIds.length} proxy observation(s) created`,
    );
    for (const skip of propagation.skipped) {
      console.log(`   skipped ${skip.targetObjectiveCode}: ${skip.reason}`);
    }

    // Recalculate all affected assertions.
    const outcomes = await recalculateForObservations(db, [
      directEvidence,
      ...supportingIds,
      ...propagation.createdProxyObservationIds,
    ]);
    console.log("\n── Learner assertions after recalculation");
    for (const code of [
      "RUST-NET-L3-001",
      "RUST-NET-L2-003",
      "RUST-NET-L2-004",
      "NET-TCP-L1-003",
      "NET-TCP-L1-004",
    ]) {
      const outcome = outcomes.get(ctx.objective(code))?.[0];
      if (outcome) {
        console.log(`   ${code}: ${outcome.state} (confidence ${outcome.confidence.toFixed(2)})`);
      }
    }

    // ── Step 10: evidence lineage (§15.7) ─────────────────────────────────
    console.log("\n── §25.10 Why is RUST-NET-L2-003 demonstrated? (§15.7 lineage)");
    const lineage = await db.execute(sql`
      SELECT a.state, a.confidence,
             o.id AS observation_id, o.origin, o.evidence_strength,
             o.details->>'implicationType' AS rule_type,
             o.details->'requiredCriterionCodes' AS gated_criteria,
             src.id AS source_observation_id,
             srclo.canonical_code AS source_objective
      FROM learner.objective_assertion a
      JOIN learner.assertion_evidence ae ON ae.assertion_id = a.id
      JOIN evidence.observation o ON o.id = ae.evidence_observation_id
      LEFT JOIN evidence.observation src ON src.id = o.source_evidence_id
      LEFT JOIN catalog.learning_objective_revision srclor ON srclor.id = src.objective_revision_id
      LEFT JOIN catalog.learning_objective srclo ON srclo.id = srclor.learning_objective_id
      WHERE a.learner_id = ${learner.id}
        AND a.objective_revision_id = ${ctx.objective("RUST-NET-L2-003")}
    `);
    for (const row of lineage.rows) {
      console.log(`   assertion: ${row.state} (confidence ${row.confidence})`);
      console.log(
        `   evidence: ${row.origin} ${row.evidence_strength} observation ${row.observation_id}`,
      );
      if (row.source_observation_id) {
        console.log(
          `   derived from: direct evidence on ${row.source_objective} via ${row.rule_type}`,
        );
        console.log(`   gated by criteria: ${JSON.stringify(row.gated_criteria)}`);
      }
    }

    // ── Steps 11–12: role readiness ────────────────────────────────────────
    console.log("\n── §25.12 Software Engineer Level 3 readiness (§15.5)");
    const roleState = await evaluateRoleState(db, learner.id, ctx.roleLevelRevisionId);
    console.log(
      `   state=${roleState.state} readiness=${(roleState.readinessScore * 100).toFixed(1)}% ` +
        `(${roleState.requirementsMet}/${roleState.requirementsTotal} requirements)`,
    );
    printGroups(roleState.roots, "   ");

    // ── Step 14: direct-evidence-required rejects proxy-only ──────────────
    console.log("\n── §25.14 Proxy evidence vs direct-evidence-required policy");
    const proxyAllowed = await checkObjectiveSatisfaction(
      db,
      learner.id,
      ctx.objective("RUST-NET-L2-003"),
      {
        directEvidenceRequired: false,
        proxyEvidenceAllowed: true,
        minimumIndependence: 3,
        minimumTransfer: "near",
        maximumEvidenceAge: null,
        contexts: [],
      },
    );
    console.log(
      `   RUST-NET-L2-003 with proxy allowed:  satisfied=${proxyAllowed.satisfied} via=${proxyAllowed.via}`,
    );
    const directRequired = await checkObjectiveSatisfaction(
      db,
      learner.id,
      ctx.objective("RUST-NET-L2-003"),
      {
        directEvidenceRequired: true,
        proxyEvidenceAllowed: false,
        minimumIndependence: 3,
        minimumTransfer: "near",
        maximumEvidenceAge: null,
        contexts: [],
      },
    );
    console.log(
      `   RUST-NET-L2-003 with direct required: satisfied=${directRequired.satisfied} (${directRequired.reason})`,
    );

    // ── Step 13 recap: frontier after the mission ──────────────────────────
    console.log("\n── Frontier after the mission (top 5)");
    const after = await computeFrontier(db, learner.id, ctx.roleLevelRevisionId);
    for (const entry of after.available.slice(0, 5)) {
      console.log(
        `   ${entry.score.toFixed(2)}  L${entry.masteryLevel} ${entry.canonicalCode} — ${entry.reasons.join("; ")}`,
      );
    }
    console.log(`   (${after.available.length} available, ${after.blocked.length} still blocked)`);
  } finally {
    await pool.end();
  }
}

function printGroups(groups: GroupEvaluation[], indent: string): void {
  for (const group of groups) {
    const mark = group.satisfied ? "✓" : "✗";
    const nOf = group.minimumCount ? ` n=${group.minimumCount}` : "";
    const met = group.requirements.filter((r) => r.satisfied).length;
    const detail =
      group.requirements.length > 0 ? ` (${met}/${group.requirements.length} objectives)` : "";
    console.log(`${indent}${mark} [${group.operator}${nOf}] ${group.label}${detail}`);
    for (const requirement of group.requirements.filter((r) => r.satisfied)) {
      console.log(`${indent}   • ${requirement.objectiveCode} satisfied via ${requirement.via}`);
    }
    printGroups(group.children, `${indent}  `);
  }
}

interface DemoContext {
  releaseId: string;
  roleLevelRevisionId: string;
  qualificationAdministrationId: string;
  objective: (code: string) => string;
  evidenceSpec: (code: string) => string;
}

async function loadContext(db: Database): Promise<DemoContext> {
  const releaseResult = await db.execute(sql`
    SELECT fr.id FROM catalog.framework_release fr
    JOIN catalog.framework f ON f.id = fr.framework_id
    WHERE f.code = 'SWE' AND fr.version = '0.1.0' AND fr.status = 'published'
  `);
  const releaseId = releaseResult.rows[0]?.id;
  if (typeof releaseId !== "string")
    throw new Error("published release SWE 0.1.0 not found — run db:reset first");

  const roleLevelResult = await db.execute(sql`
    SELECT rlr.id FROM qualification.role_level_revision rlr
    JOIN qualification.role_level rl ON rl.id = rlr.role_level_id
    JOIN qualification.role r ON r.id = rl.role_id
    WHERE r.canonical_code = 'software-engineer' AND rl.level = 3 AND rlr.status = 'published'
  `);
  const roleLevelRevisionId = roleLevelResult.rows[0]?.id;
  if (typeof roleLevelRevisionId !== "string")
    throw new Error("published SE L3 revision not found");

  const administrationResult = await db.execute(sql`
    SELECT ta.id FROM assessment.task_administration ta
    JOIN assessment.task_variant tv ON tv.id = ta.task_variant_id
    JOIN assessment.task_revision tr ON tr.id = tv.task_revision_id
    JOIN assessment.task_template tt ON tt.id = tr.task_template_id
    WHERE tt.canonical_code = 'TASK-RUST-FRAMING-CHALLENGE-01' AND ta.mode = 'qualification'
  `);
  const qualificationAdministrationId = administrationResult.rows[0]?.id;
  if (typeof qualificationAdministrationId !== "string")
    throw new Error("qualification administration not found");

  const objectiveRows = await db.execute(sql`
    SELECT lo.canonical_code, lor.id
    FROM catalog.framework_release_objective fro
    JOIN catalog.learning_objective_revision lor ON lor.id = fro.objective_revision_id
    JOIN catalog.learning_objective lo ON lo.id = lor.learning_objective_id
    WHERE fro.framework_release_id = ${releaseId}
  `);
  const objectivesByCode = new Map(
    objectiveRows.rows.map((row) => [String(row.canonical_code), String(row.id)]),
  );

  const specRows = await db.execute(sql`
    SELECT lo.canonical_code, spec.id
    FROM assessment.task_objective_evidence_spec spec
    JOIN catalog.learning_objective_revision lor ON lor.id = spec.objective_revision_id
    JOIN catalog.learning_objective lo ON lo.id = lor.learning_objective_id
    JOIN assessment.task_revision tr ON tr.id = spec.task_revision_id
    JOIN assessment.task_template tt ON tt.id = tr.task_template_id
    WHERE tt.canonical_code = 'TASK-RUST-FRAMING-CHALLENGE-01'
  `);
  const specsByCode = new Map(
    specRows.rows.map((row) => [String(row.canonical_code), String(row.id)]),
  );

  return {
    releaseId,
    roleLevelRevisionId,
    qualificationAdministrationId,
    objective: (code: string) => {
      const id = objectivesByCode.get(code);
      if (!id) throw new Error(`objective ${code} not found in release`);
      return id;
    },
    evidenceSpec: (code: string) => {
      const id = specsByCode.get(code);
      if (!id) throw new Error(`evidence spec for ${code} not found`);
      return id;
    },
  };
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
