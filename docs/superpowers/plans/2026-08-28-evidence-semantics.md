# Evidence Semantics Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make context, criteria, transfer/scope, and evidence ceilings first-class so the system can say precisely *what* a learner demonstrated and *where*.

**Architecture:** Postgres schema authored in Drizzle ORM across seven Postgres schemas (`catalog`, `learning`, `assessment`, `evidence`, `learner`, `qualification`, `projection`), with a governance layer of hand-written trigger functions as the database backstop. Changes land expand / migrate / contract across three migrations — `0003` additive, `0004` governance, `0005` drops — so `pnpm db:reset` succeeds at every commit. Services are plain functions and small classes over the Drizzle client; there is no API layer yet.

**Tech Stack:** TypeScript (ESM, `type: module`), Drizzle ORM 0.45 + drizzle-kit 0.31, Postgres 17 via docker-compose, pnpm workspaces + Turborepo, Biome for lint/format, Vitest (added by Task 1).

**Spec:** `docs/superpowers/specs/2026-08-28-evidence-semantics-design.md` — read it before starting. The plan argues from the spec; where they disagree, the spec wins except on the migration count noted below.

## Global Constraints

- **Migration count is three, not two.** The spec's Migration Strategy section was updated to match. `0003` additive, `0004` governance, `0005` drops.
- **Never leave `pnpm db:reset` broken at a commit.** Every task must end green. Add new columns before removing old ones; rewrite the seed onto new columns before dropping old ones.
- **Regenerate migrations with `pnpm --filter @lighthouse/db db:generate`.** Never hand-edit a drizzle-generated file. `0004` is hand-written and must be added to `packages/db/drizzle/meta/_journal.json` manually, following the shape of the existing `0001_governance_triggers` entry.
- **`context_key` is identity, never matching.** Qualification evaluates structured `learner.objective_assertion_context` rows through the parent-value closure. No code anywhere may compare context-key strings to decide satisfaction.
- **Observable results are always stated positively.** `successful` means the good outcome obtained — for a `critical_error` criterion that means the error was *avoided*.
- **`direct` evidence strength means claim-complete**, not merely "not proxy".
- Verification commands, run from the repo root: `pnpm lint`, `pnpm check-types`, `pnpm db:reset`, `pnpm --filter @lighthouse/db db:demo`, `pnpm --filter @lighthouse/db test`.
- **drizzle-kit mis-splits raw SQL containing a literal `;`**, even inside a quoted string, corrupting the emitted migration `.sql` while leaving the snapshot JSON correct. If a `check()` or other raw SQL fragment needs a semicolon, write it as a Postgres hex escape (`E'[\x3B=]'`), never literally. Found the hard way in Task 2.
- Biome config is 2-space indent, 100-char lines, double quotes. Run `pnpm lint:fix` before committing if `pnpm lint` complains.

## File Structure

**Created:**
- `packages/db/src/schema/context.ts` — `catalog.context_dimension`, `catalog.context_value`. Own file because context is a new top-level concept and `catalog.ts` is already 553 lines.
- `packages/db/src/services/context.ts` — context authoring service and the TypeScript mirror of the canonicalization rule.
- `packages/db/vitest.config.ts` — Vitest config.
- `packages/db/src/test/global-setup.ts` — creates and seeds the `lighthouse_test` database once per run.
- `packages/db/src/test/helpers.ts` — shared test database connection and lookup helpers.
- `packages/db/src/test/context.test.ts`, `criteria.test.ts`, `ceiling.test.ts` — the six smoke cases from spec §9.
- `packages/db/src/seed/data/context.ts` — context dimensions and values.
- `packages/db/src/seed/data/cloud.ts` — the cloud-computing seed branch.
- `packages/db/drizzle/0004_evidence_semantics_governance.sql` — hand-written governance.

**Modified:** every file under `packages/db/src/schema/`, `packages/db/src/services/`, and `packages/db/src/seed/`, plus `packages/db/src/demo/scenario.ts` and `packages/db/package.json`.

## Task Dependency Notes

- **Task 14 must run immediately before Task 11.** It is at the end of the file for numbering reasons only.
- **Task 3 must precede Task 10.** Task 3 is a safe refactor *only* because no seeded objective declares a required context dimension yet, so every assertion keys to `''` and behavior is unchanged. Task 10 seeds the first required dimensions. Reversing them turns Task 3 into an untested semantics change.
- **Task 6 (seed criteria) must precede Task 7 (drops).**
- **Task 11 (immutability) must come last among schema tasks** — it freezes rows that earlier tasks still need to write.

---

## Task 1: Vitest harness against a dedicated test database

**Files:**
- Create: `packages/db/vitest.config.ts`
- Create: `packages/db/src/test/global-setup.ts`
- Create: `packages/db/src/test/helpers.ts`
- Create: `packages/db/src/test/harness.test.ts`
- Modify: `packages/db/package.json`

**Interfaces:**
- Consumes: nothing.
- Produces: `TEST_DATABASE_URL` constant, `withDb()` helper returning `{ db, pool }`, and `objectiveId(db, code)` / `releaseId(db)` lookups used by every later test task.

**Context you need:** The seed script `packages/db/src/seed/index.ts` calls `main()` at module scope, so it **must** be shelled out to, never imported. The `lighthouse` Postgres role is a superuser with CREATEDB, verified, so `CREATE DATABASE` works. `packages/db/src/client.ts` exports `createDb(connectionString) => { db, pool }`.

- [ ] **Step 1: Add vitest as a dev dependency**

```bash
pnpm --filter @lighthouse/db add -D vitest@^3.2.4
```

- [ ] **Step 2: Add the test script**

In `packages/db/package.json`, add to `scripts`:

```json
"test": "vitest run"
```

- [ ] **Step 3: Write the Vitest config**

Create `packages/db/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/test/**/*.test.ts"],
    globalSetup: ["src/test/global-setup.ts"],
    // Migrations and seed run once; tests share one database and must not
    // depend on each other's writes. Each test creates its own learner.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
```

- [ ] **Step 4: Write the global setup**

Create `packages/db/src/test/global-setup.ts`:

```ts
import { execFileSync } from "node:child_process";
import "dotenv/config";
import pg from "pg";

const ADMIN_URL =
  process.env.DATABASE_URL ?? "postgres://lighthouse:lighthouse@localhost:5432/lighthouse";
export const TEST_DATABASE_URL = ADMIN_URL.replace(/\/[^/]*$/, "/lighthouse_test");

export async function setup(): Promise<void> {
  const admin = new pg.Client({ connectionString: ADMIN_URL });
  await admin.connect();
  try {
    // Drop first: a leftover database from a failed run would be seeded twice,
    // and the seed refuses to run against an existing framework.
    await admin.query("DROP DATABASE IF EXISTS lighthouse_test WITH (FORCE)");
    await admin.query("CREATE DATABASE lighthouse_test");
  } finally {
    await admin.end();
  }

  const env = { ...process.env, DATABASE_URL: TEST_DATABASE_URL };
  // The seed calls main() at module scope, so it is executed, never imported.
  execFileSync("pnpm", ["exec", "drizzle-kit", "migrate"], { env, stdio: "inherit" });
  execFileSync("pnpm", ["exec", "tsx", "src/seed/index.ts"], { env, stdio: "inherit" });
}
```

- [ ] **Step 5: Write the shared helpers**

Create `packages/db/src/test/helpers.ts`:

```ts
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
```

- [ ] **Step 6: Write the harness test**

Create `packages/db/src/test/harness.test.ts`:

```ts
import { afterAll, expect, test } from "vitest";
import { objectiveId, releaseId, withDb } from "./helpers";

const { db, pool } = withDb();
afterAll(async () => { await pool.end(); });

test("the test database is migrated and seeded", async () => {
  await expect(releaseId(db)).resolves.toMatch(/^[0-9a-f-]{36}$/);
  await expect(objectiveId(db, "RUST-NET-L3-001")).resolves.toMatch(/^[0-9a-f-]{36}$/);
});
```

- [ ] **Step 7: Run the test and verify it passes**

Run: `pnpm --filter @lighthouse/db test`
Expected: migrations and seed print, then `1 passed`. First run takes ~30s because of the seed.

- [ ] **Step 8: Verify the repo is still green**

Run: `pnpm lint && pnpm check-types`
Expected: both clean.

- [ ] **Step 9: Commit**

```bash
git add packages/db/vitest.config.ts packages/db/src/test packages/db/package.json pnpm-lock.yaml
git commit -m "test: add vitest harness against a dedicated test database"
```

---

## Task 2: Context dimensions and values (additive)

**Files:**
- Create: `packages/db/src/schema/context.ts`
- Create: `packages/db/src/services/context.ts`
- Create: `packages/db/src/test/context.test.ts`
- Modify: `packages/db/src/schema/index.ts`, `packages/db/src/schema/enums.ts`
- Create: `packages/db/drizzle/0004_evidence_semantics_governance.sql`
- Modify: `packages/db/drizzle/meta/_journal.json`

**Interfaces:**
- Consumes: `withDb`, `releaseId` from Task 1.
- Produces:
  - `canonicalContextKey(contexts: Record<string, string>): string`
  - `class ContextService` with `createDimension(input: ContextDimensionInput): Promise<void>`, `createValue(input: ContextValueInput): Promise<string>`, and `readonly valueIdByCode: Map<string, string>` keyed `"<dimension>:<value>"`.
  - SQL function `governance.canonical_context_key(jsonb) RETURNS text`.

This task is purely additive — no existing table changes — so the seed and demo keep working untouched.

- [ ] **Step 1: Write the failing test**

Create `packages/db/src/test/context.test.ts`:

```ts
import { sql } from "drizzle-orm";
import { afterAll, expect, test } from "vitest";
import { canonicalContextKey } from "../services/context";
import { withDb } from "./helpers";

const { db, pool } = withDb();
afterAll(async () => { await pool.end(); });

test("canonical context keys sort by dimension and join with semicolons", () => {
  expect(canonicalContextKey({})).toBe("");
  expect(canonicalContextKey({ cloud_provider: "aws" })).toBe("cloud_provider=aws");
  expect(
    canonicalContextKey({ programming_language: "rust", cloud_provider: "aws" }),
  ).toBe("cloud_provider=aws;programming_language=rust");
  // Discriminating case: these two differ only after 'cloud', so they order
  // oppositely under a locale collation vs byte order. Every other case here
  // differs at character 0 and passes under either.
  expect(canonicalContextKey({ cloud_provider: "x", cloudiness: "y" })).toBe(
    "cloud_provider=x;cloudiness=y",
  );
});

test("the database canonicalization agrees with the TypeScript mirror", async () => {
  const cases: Array<Record<string, string>> = [
    {},
    { cloud_provider: "aws" },
    { programming_language: "rust", cloud_provider: "aws_govcloud" },
    { cloud_provider: "x", cloudiness: "y" },
  ];
  for (const contexts of cases) {
    const result = await db.execute(
      sql`SELECT governance.canonical_context_key(${JSON.stringify(contexts)}::jsonb) AS key`,
    );
    expect(result.rows[0]?.key).toBe(canonicalContextKey(contexts));
  }
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `pnpm --filter @lighthouse/db test src/test/context.test.ts`
Expected: FAIL — cannot resolve `../services/context`.

- [ ] **Step 3: Add the context policy enum**

In `packages/db/src/schema/enums.ts`, after `relationshipProvenanceEnum`, add:

```ts
export const contextPolicyEnum = catalogSchema.enum("context_policy", [
  "required",
  "optional",
  "not_applicable",
]);
```

- [ ] **Step 4: Write the context schema**

Create `packages/db/src/schema/context.ts`:

```ts
import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  foreignKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { catalogSchema } from "./enums";

// ---------------------------------------------------------------------------
// Context dimensions and values.
//
// A dimension names a way the world varies that can materially change a
// capability claim: which cloud provider, which language, which OS.
//
// `parent_value_id` carries one precise meaning, and it is NOT "sensible
// taxonomy grouping": evidence gathered at the child value is valid evidence
// for the parent value. aws_govcloud's parent is aws because demonstrating
// something in GovCloud demonstrates it on AWS. A hierarchy built on any other
// principle produces wrong qualification decisions.
// ---------------------------------------------------------------------------

export const contextDimension = catalogSchema.table("context_dimension", {
  code: text("code").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const contextValue = catalogSchema.table(
  "context_value",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dimensionCode: text("dimension_code")
      .notNull()
      .references(() => contextDimension.code),
    code: text("code").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    parentValueId: uuid("parent_value_id").references((): AnyPgColumn => contextValue.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("uq_context_value_code").on(t.dimensionCode, t.code),
    check("ck_context_value_no_self_parent", sql`parent_value_id IS NULL OR parent_value_id <> id`),
  ],
);
```

- [ ] **Step 5: Export the new schema module**

In `packages/db/src/schema/index.ts`, add the export in alphabetical position (after `./catalog`):

```ts
export * from "./context";
```

- [ ] **Step 6: Write the context service**

Create `packages/db/src/services/context.ts`:

```ts
import { and, eq } from "drizzle-orm";
import type { Database } from "../client";
import * as s from "../schema/index";

/**
 * Context authoring and the canonicalization rule.
 *
 * `canonicalContextKey` mirrors governance.canonical_context_key. The database
 * function is authoritative — assertions are written with it — and this mirror
 * exists for previews and for building query predicates. The two are kept
 * honest by a test that compares them on the same inputs.
 */

export interface ContextDimensionInput {
  code: string;
  name: string;
  description?: string;
}

export interface ContextValueInput {
  dimensionCode: string;
  code: string;
  name: string;
  description?: string;
  /** Value code within the same dimension. Evidence here is valid for the parent. */
  parentCode?: string;
}

/** Sorted by dimension code, `dimension=value` joined by `;`, `''` when empty. */
export function canonicalContextKey(contexts: Record<string, string>): string {
  return Object.keys(contexts)
    .sort()
    .map((dimension) => `${dimension}=${contexts[dimension]}`)
    .join(";");
}

export class ContextService {
  /** "<dimension>:<value>" -> context_value.id */
  readonly valueIdByCode = new Map<string, string>();

  constructor(private readonly db: Database) {}

  async createDimension(input: ContextDimensionInput): Promise<void> {
    await this.db.insert(s.contextDimension).values({
      code: input.code,
      name: input.name,
      description: input.description ?? "",
    });
  }

  async createValue(input: ContextValueInput): Promise<string> {
    const parentValueId = input.parentCode
      ? this.requireValue(input.dimensionCode, input.parentCode)
      : null;

    const [created] = await this.db
      .insert(s.contextValue)
      .values({
        dimensionCode: input.dimensionCode,
        code: input.code,
        name: input.name,
        description: input.description ?? "",
        parentValueId,
      })
      .returning({ id: s.contextValue.id });
    if (!created) throw new Error(`failed to insert context value ${input.code}`);

    this.valueIdByCode.set(`${input.dimensionCode}:${input.code}`, created.id);
    return created.id;
  }

  requireValue(dimensionCode: string, valueCode: string): string {
    const id = this.valueIdByCode.get(`${dimensionCode}:${valueCode}`);
    if (!id) throw new Error(`unknown context value ${dimensionCode}:${valueCode}`);
    return id;
  }
}

/** Resolve a context value by codes, for callers without a live service. */
export async function findContextValueId(
  db: Database,
  dimensionCode: string,
  valueCode: string,
): Promise<string> {
  const rows = await db
    .select({ id: s.contextValue.id })
    .from(s.contextValue)
    .where(
      and(eq(s.contextValue.dimensionCode, dimensionCode), eq(s.contextValue.code, valueCode)),
    );
  const id = rows[0]?.id;
  if (!id) throw new Error(`unknown context value ${dimensionCode}:${valueCode}`);
  return id;
}
```

- [ ] **Step 7: Generate the additive migration**

Run: `pnpm --filter @lighthouse/db db:generate`
Expected: creates `packages/db/drizzle/0003_<name>.sql` containing `CREATE TABLE "catalog"."context_dimension"` and `"catalog"."context_value"`. Rename the file to `0003_evidence_semantics.sql` and update its `tag` in `packages/db/drizzle/meta/_journal.json` to `0003_evidence_semantics`.

- [ ] **Step 8: Write the governance migration**

Create `packages/db/drizzle/0004_evidence_semantics_governance.sql`:

```sql
-- ---------------------------------------------------------------------------
-- Evidence semantics governance (spec §1, §8).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION governance.canonical_context_key(contexts jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  -- COLLATE "C" is load-bearing: it makes the ordering byte-wise, matching
  -- JavaScript's default sort. Under a locale collation (en_US.utf8) '_' is
  -- near-ignorable, so 'cloudiness' sorts BEFORE 'cloud_provider' here while
  -- the TS mirror orders them the other way -- a silent divergence that mints
  -- duplicate assertion rows. It also makes IMMUTABLE sound, since a locale
  -- collation can shift under a glibc/ICU upgrade.
  SELECT coalesce(
    string_agg(key || '=' || value, ';' ORDER BY key COLLATE "C"),
    ''
  )
  FROM jsonb_each_text(coalesce(contexts, '{}'::jsonb)) AS t(key, value);
$$;
--> statement-breakpoint

-- A context value's parent must belong to the same dimension, and the parent
-- chain must be acyclic. Both matter because qualification walks the chain.
CREATE OR REPLACE FUNCTION governance.enforce_context_value_hierarchy()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  parent_dimension text;
  cursor_id uuid;
  hops integer := 0;
BEGIN
  IF NEW.parent_value_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT dimension_code INTO parent_dimension
  FROM catalog.context_value WHERE id = NEW.parent_value_id;

  IF parent_dimension IS DISTINCT FROM NEW.dimension_code THEN
    RAISE EXCEPTION 'context value % parent belongs to dimension %, not %',
      NEW.code, parent_dimension, NEW.dimension_code;
  END IF;

  cursor_id := NEW.parent_value_id;
  WHILE cursor_id IS NOT NULL LOOP
    IF cursor_id = NEW.id THEN
      RAISE EXCEPTION 'context value % would create a parent cycle', NEW.code;
    END IF;
    hops := hops + 1;
    IF hops > 32 THEN
      RAISE EXCEPTION 'context value parent chain for % exceeds 32 hops', NEW.code;
    END IF;
    SELECT parent_value_id INTO cursor_id FROM catalog.context_value WHERE id = cursor_id;
  END LOOP;

  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER trg_context_value_hierarchy
BEFORE INSERT OR UPDATE ON catalog.context_value
FOR EACH ROW EXECUTE FUNCTION governance.enforce_context_value_hierarchy();
```

- [ ] **Step 9: Register the governance migration in the journal**

In `packages/db/drizzle/meta/_journal.json`, append an entry after the `0003` one, copying the shape of the existing entries. Use a `when` value greater than `0003`'s:

```json
{
  "idx": 4,
  "version": "7",
  "when": 1788000000000,
  "tag": "0004_evidence_semantics_governance",
  "breakpoints": true
}
```

- [ ] **Step 10: Rebuild the database and run the tests**

Run: `pnpm db:reset && pnpm --filter @lighthouse/db test`
Expected: reset succeeds unchanged; both context tests pass.

- [ ] **Step 11: Verify the demo is byte-identical**

Run: `pnpm --filter @lighthouse/db db:demo`
Expected: output identical to the baseline. Confirm specifically that it prints `readiness=11.4% (4/35 requirements)` and `1 proxy observation(s) created`. Nothing in this task changes behavior.

- [ ] **Step 12: Commit**

```bash
git add packages/db/src/schema packages/db/src/services/context.ts packages/db/src/test packages/db/drizzle
git commit -m "feat: add context dimensions, values, and canonicalization"
```

---

## Task 3: Context-keyed assertions

**Depends on:** no seeded objective declares a required context dimension yet. This is what makes the task a behavior-preserving refactor: every assertion keys to `''`. **Task 10 must not run before this task.**

**Files:**
- Modify: `packages/db/src/schema/assertions.ts`, `packages/db/src/schema/evidence.ts`, `packages/db/src/schema/qualification.ts`
- Modify: `packages/db/src/services/assertions.ts`, `packages/db/src/services/evidence.ts`, `packages/db/src/services/role-state.ts`, `packages/db/src/services/role-compiler.ts`
- Modify: `packages/db/src/demo/scenario.ts`
- Modify: `packages/db/src/test/context.test.ts`

**Interfaces:**
- Consumes: `canonicalContextKey` (Task 2).
- Produces:
  - `interface AssertionOutcome { contextKey: string; state: string; confidence: number }`
  - `recalculateAssertionsForObjective(db, learnerId, objectiveRevisionId): Promise<AssertionOutcome[]>`
  - `recalculateForObservations(db, observationIds): Promise<Map<string, AssertionOutcome[]>>` — keyed by `objectiveRevisionId`
  - `RecordObservationInput.contexts?: Record<string, string>` — dimension code to value code
  - `EvidencePolicyCheck.contexts: RequirementContextCheck[]` where
    `interface RequirementContextCheck { dimensionCode: string; valueCode: string | null; minimumDistinctValues: number }`

- [ ] **Step 1: Write the failing test**

Append to `packages/db/src/test/context.test.ts`:

```ts
import { recalculateForObservations } from "../services/assertions";
import { recordObservation } from "../services/evidence";
import { createLearner, objectiveId } from "./helpers";

test("an objective with no required dimensions keys its assertion to the empty string", async () => {
  const learnerId = await createLearner(db, "ctx-empty-key");
  const target = await objectiveId(db, "NET-TCP-L1-001");

  const observationId = await recordObservation(db, {
    learnerId,
    objectiveRevisionId: target,
    result: "successful",
    evidenceStrength: "direct",
    independenceLevel: 4,
    transferLevel: "near",
  });
  const outcomes = await recalculateForObservations(db, [observationId]);

  const forObjective = outcomes.get(target);
  expect(forObjective).toHaveLength(1);
  expect(forObjective?.[0]?.contextKey).toBe("");
  expect(forObjective?.[0]?.state).toBe("demonstrated");
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `pnpm --filter @lighthouse/db test src/test/context.test.ts`
Expected: FAIL — `outcomes.get(target)` is not an array (current signature returns a single object).

- [ ] **Step 3: Restructure the assertion schema**

Replace the `objectiveAssertion` and `assertionEvidence` definitions in `packages/db/src/schema/assertions.ts` with:

```ts
export const objectiveAssertion = learnerSchema.table(
  "objective_assertion",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    learnerId: uuid("learner_id")
      .notNull()
      .references(() => profile.id),
    objectiveRevisionId: uuid("objective_revision_id")
      .notNull()
      .references(() => learningObjectiveRevision.id),
    // Fingerprint only. Qualification matching reads objective_assertion_context
    // and walks the context value closure; it never compares these strings.
    contextKey: text("context_key").notNull().default(""),
    state: assertionStateEnum("state").notNull(),
    confidence: numeric("confidence", { precision: 4, scale: 3 }).notNull(),
    lastDirectEvidenceAt: timestamp("last_direct_evidence_at", { withTimezone: true }),
    lastAnyEvidenceAt: timestamp("last_any_evidence_at", { withTimezone: true }),
    inferenceModelVersion: text("inference_model_version").notNull(),
    calculatedAt: timestamp("calculated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("uq_objective_assertion_scope").on(t.learnerId, t.objectiveRevisionId, t.contextKey),
    check("ck_assertion_confidence", sql`confidence BETWEEN 0 AND 1`),
  ],
);

export const objectiveAssertionContext = learnerSchema.table(
  "objective_assertion_context",
  {
    assertionId: uuid("assertion_id")
      .notNull()
      .references(() => objectiveAssertion.id, { onDelete: "cascade" }),
    dimensionCode: text("dimension_code")
      .notNull()
      .references(() => contextDimension.code),
    contextValueId: uuid("context_value_id")
      .notNull()
      .references(() => contextValue.id),
  },
  (t) => [primaryKey({ columns: [t.assertionId, t.dimensionCode] })],
);

export const assertionEvidence = learnerSchema.table(
  "assertion_evidence",
  {
    assertionId: uuid("assertion_id")
      .notNull()
      .references(() => objectiveAssertion.id, { onDelete: "cascade" }),
    evidenceObservationId: uuid("evidence_observation_id")
      .notNull()
      .references(() => observation.id),
    contributionWeight: numeric("contribution_weight", { precision: 6, scale: 5 })
      .notNull()
      .default("1"),
  },
  (t) => [
    primaryKey({ columns: [t.assertionId, t.evidenceObservationId] }),
    check("ck_assertion_evidence_weight", sql`contribution_weight BETWEEN 0 AND 1`),
  ],
);
```

Update the imports at the top of the file to add `text`, `unique`, `uuid` from `drizzle-orm/pg-core` as needed, and `contextDimension`, `contextValue` from `./context`.

- [ ] **Step 4: Add observation context to the evidence schema**

In `packages/db/src/schema/evidence.ts`, after `observableResult`, add:

```ts
export const observationContext = evidenceSchema.table(
  "observation_context",
  {
    observationId: uuid("observation_id")
      .notNull()
      .references(() => observation.id),
    dimensionCode: text("dimension_code")
      .notNull()
      .references(() => contextDimension.code),
    contextValueId: uuid("context_value_id")
      .notNull()
      .references(() => contextValue.id),
  },
  (t) => [primaryKey({ columns: [t.observationId, t.dimensionCode] })],
);
```

Import `contextDimension` and `contextValue` from `./context`.

- [ ] **Step 5: Add requirement context to the qualification schema**

In `packages/db/src/schema/qualification.ts`, after `objectiveRequirement`, add:

```ts
export const objectiveRequirementContext = qualificationSchema.table(
  "objective_requirement_context",
  {
    objectiveRequirementId: uuid("objective_requirement_id")
      .notNull()
      .references(() => objectiveRequirement.id),
    dimensionCode: text("dimension_code")
      .notNull()
      .references(() => contextDimension.code),
    // Pin a value, or leave null and demand breadth. Never both.
    contextValueId: uuid("context_value_id").references(() => contextValue.id),
    minimumDistinctValues: integer("minimum_distinct_values").notNull().default(1),
  },
  (t) => [
    primaryKey({ columns: [t.objectiveRequirementId, t.dimensionCode] }),
    check(
      "ck_requirement_context_pin_or_breadth",
      sql`context_value_id IS NULL OR minimum_distinct_values = 1`,
    ),
    check("ck_requirement_context_minimum", sql`minimum_distinct_values >= 1`),
  ],
);
```

Import `contextDimension` and `contextValue` from `./context`.

Also add the variant-side context in `packages/db/src/schema/assessment.ts`, after `taskVariant` — this is the context a variant actually delivers, and it supplies the default when recording:

```ts
export const taskVariantContext = assessmentSchema.table(
  "task_variant_context",
  {
    taskVariantId: uuid("task_variant_id")
      .notNull()
      .references(() => taskVariant.id),
    dimensionCode: text("dimension_code")
      .notNull()
      .references(() => contextDimension.code),
    contextValueId: uuid("context_value_id")
      .notNull()
      .references(() => contextValue.id),
  },
  (t) => [primaryKey({ columns: [t.taskVariantId, t.dimensionCode] })],
);
```

Import `contextDimension`, `contextValue` from `./context` and `primaryKey` from `drizzle-orm/pg-core`.

- [ ] **Step 6: Accept contexts when recording an observation**

In `packages/db/src/services/evidence.ts`, add to `RecordObservationInput`:

```ts
  /** Dimension code -> context value code, e.g. { cloud_provider: "aws" }. */
  contexts?: Record<string, string>;
```

Inside `recordObservation`'s transaction, after the `observableResults` loop, add:

```ts
    for (const [dimensionCode, valueCode] of Object.entries(input.contexts ?? {})) {
      const valueResult = await tx.execute(sql`
        SELECT id FROM catalog.context_value
        WHERE dimension_code = ${dimensionCode} AND code = ${valueCode}
      `);
      const contextValueId = valueResult.rows[0]?.id;
      if (typeof contextValueId !== "string") {
        throw new Error(`unknown context value ${dimensionCode}:${valueCode}`);
      }
      await tx.insert(s.observationContext).values({
        observationId: observation.id,
        dimensionCode,
        contextValueId,
      });
    }
```

Also propagate context onto proxy observations: in `propagateFromObservation`, after inserting the proxy row and before the transitive recursion, add:

```ts
    // Proxy evidence inherits the context of the evidence it derives from.
    await db.execute(sql`
      INSERT INTO evidence.observation_context (observation_id, dimension_code, context_value_id)
      SELECT ${proxy.id}, dimension_code, context_value_id
      FROM evidence.observation_context WHERE observation_id = ${observationId}
    `);
```

- [ ] **Step 7: Rewrite assertion recalculation to group by context**

Replace `recalculateAssertion` and `recalculateForObservations` in `packages/db/src/services/assertions.ts` with:

```ts
export interface AssertionOutcome {
  contextKey: string;
  state: string;
  confidence: number;
}

/**
 * Recalculate every context-scoped assertion for one (learner, objective).
 *
 * Observations are grouped by the objective's REQUIRED dimensions only.
 * Optional dimensions are recorded on the observation and are deliberately
 * invisible here — they would otherwise fragment assertions on a dimension
 * nobody asked to scope by.
 *
 * An observation missing any required dimension is skipped: it happened, but it
 * cannot establish a properly scoped claim.
 */
export async function recalculateAssertionsForObjective(
  db: Database,
  learnerId: string,
  objectiveRevisionId: string,
): Promise<AssertionOutcome[]> {
  const requiredResult = await db.execute(sql`
    SELECT dimension_code FROM catalog.objective_context_policy
    WHERE objective_revision_id = ${objectiveRevisionId} AND policy = 'required'
    ORDER BY dimension_code
  `);
  const requiredDimensions = requiredResult.rows.map((r) => String(r.dimension_code));

  const observationsResult = await db.execute(sql`
    SELECT o.id, o.result, o.evidence_strength, o.origin, o.independence_level,
           o.transfer_level, o.machine_verified, o.human_verified, o.observed_at, o.details,
           coalesce(
             (SELECT jsonb_object_agg(oc.dimension_code, cv.code)
              FROM evidence.observation_context oc
              JOIN catalog.context_value cv ON cv.id = oc.context_value_id
              WHERE oc.observation_id = o.id),
             '{}'::jsonb
           ) AS contexts
    FROM evidence.observation o
    WHERE o.learner_id = ${learnerId}
      AND o.objective_revision_id = ${objectiveRevisionId}
      AND o.status = 'active'
    ORDER BY o.observed_at ASC
  `);

  // Bucket observations by their required-dimension tuple.
  const buckets = new Map<string, { contexts: Record<string, string>; rows: ObservationRow[] }>();
  for (const raw of observationsResult.rows) {
    const contexts = (raw.contexts ?? {}) as Record<string, string>;
    const scoped: Record<string, string> = {};
    let complete = true;
    for (const dimension of requiredDimensions) {
      const value = contexts[dimension];
      if (value === undefined) {
        complete = false;
        break;
      }
      scoped[dimension] = value;
    }
    if (!complete) continue;

    const key = canonicalContextKey(scoped);
    const bucket = buckets.get(key) ?? { contexts: scoped, rows: [] };
    bucket.rows.push(raw as unknown as ObservationRow);
    buckets.set(key, bucket);
  }

  const outcomes: AssertionOutcome[] = [];

  await db.transaction(async (tx) => {
    // assertion_evidence and objective_assertion_context cascade on delete.
    await tx
      .delete(s.objectiveAssertion)
      .where(
        and(
          eq(s.objectiveAssertion.learnerId, learnerId),
          eq(s.objectiveAssertion.objectiveRevisionId, objectiveRevisionId),
        ),
      );

    for (const [, bucket] of buckets) {
      const { state, confidence, contributing } = inferState(bucket.rows);

      // The database function is authoritative for the key.
      const keyResult = await tx.execute(
        sql`SELECT governance.canonical_context_key(${JSON.stringify(bucket.contexts)}::jsonb) AS key`,
      );
      const contextKey = String(keyResult.rows[0]?.key ?? "");

      const directTimes = bucket.rows
        .filter((o) => o.origin === "direct" && o.result === "successful")
        .map((o) => o.observed_at);
      const anyTimes = bucket.rows.map((o) => o.observed_at);

      const [assertion] = await tx
        .insert(s.objectiveAssertion)
        .values({
          learnerId,
          objectiveRevisionId,
          contextKey,
          state: state as (typeof s.assertionStateEnum.enumValues)[number],
          confidence: confidence.toFixed(3),
          lastDirectEvidenceAt: directTimes.length
            ? new Date(String(directTimes[directTimes.length - 1]))
            : null,
          lastAnyEvidenceAt: anyTimes.length
            ? new Date(String(anyTimes[anyTimes.length - 1]))
            : null,
          inferenceModelVersion: inferencePolicy.modelVersion,
        })
        .returning({ id: s.objectiveAssertion.id });
      if (!assertion) throw new Error("failed to insert assertion");

      for (const [dimensionCode, valueCode] of Object.entries(bucket.contexts)) {
        await tx.execute(sql`
          INSERT INTO learner.objective_assertion_context (assertion_id, dimension_code, context_value_id)
          SELECT ${assertion.id}, ${dimensionCode}, id FROM catalog.context_value
          WHERE dimension_code = ${dimensionCode} AND code = ${valueCode}
        `);
      }

      for (const { observationId, weight } of contributing) {
        await tx.insert(s.assertionEvidence).values({
          assertionId: assertion.id,
          evidenceObservationId: observationId,
          contributionWeight: weight.toFixed(5),
        });
      }

      outcomes.push({ contextKey, state, confidence });
    }
  });

  return outcomes;
}

/** Recalculate assertions for every objective a set of observations touched. */
export async function recalculateForObservations(
  db: Database,
  observationIds: string[],
): Promise<Map<string, AssertionOutcome[]>> {
  const results = new Map<string, AssertionOutcome[]>();
  if (observationIds.length === 0) return results;

  const pairs = await db
    .selectDistinct({
      learnerId: s.observation.learnerId,
      objectiveRevisionId: s.observation.objectiveRevisionId,
    })
    .from(s.observation)
    .where(inArray(s.observation.id, observationIds));

  for (const pair of pairs) {
    const outcomes = await recalculateAssertionsForObjective(
      db,
      pair.learnerId,
      pair.objectiveRevisionId,
    );
    results.set(pair.objectiveRevisionId, outcomes);
  }
  return results;
}
```

Add `import { canonicalContextKey } from "./context";` and extend `ObservationRow` with `contexts: Record<string, string>`.

Note: `catalog.objective_context_policy` does not exist until Task 4. Until then this query would fail — so **also do Step 8 in this task**.

- [ ] **Step 8: Add the objective context policy tables**

In `packages/db/src/schema/catalog.ts`, after `frameworkReleaseObjective`, add:

```ts
export const objectiveContextPolicy = catalogSchema.table(
  "objective_context_policy",
  {
    objectiveRevisionId: uuid("objective_revision_id")
      .notNull()
      .references(() => learningObjectiveRevision.id),
    dimensionCode: text("dimension_code")
      .notNull()
      .references(() => contextDimension.code),
    policy: contextPolicyEnum("policy").notNull(),
  },
  (t) => [primaryKey({ columns: [t.objectiveRevisionId, t.dimensionCode] })],
);

export const objectiveContextAllowedValue = catalogSchema.table(
  "objective_context_allowed_value",
  {
    objectiveRevisionId: uuid("objective_revision_id")
      .notNull()
      .references(() => learningObjectiveRevision.id),
    dimensionCode: text("dimension_code").notNull(),
    contextValueId: uuid("context_value_id")
      .notNull()
      .references(() => contextValue.id),
  },
  (t) => [
    primaryKey({ columns: [t.objectiveRevisionId, t.dimensionCode, t.contextValueId] }),
    foreignKey({
      name: "fk_objective_context_allowed_policy",
      columns: [t.objectiveRevisionId, t.dimensionCode],
      foreignColumns: [objectiveContextPolicy.objectiveRevisionId, objectiveContextPolicy.dimensionCode],
    }),
  ],
);
```

Import `contextDimension`, `contextValue` from `./context` and `contextPolicyEnum` from `./enums`.

- [ ] **Step 9: Teach role-state to match contexts through the closure**

In `packages/db/src/services/role-state.ts`, add above `EvidencePolicyCheck`:

```ts
export interface RequirementContextCheck {
  dimensionCode: string;
  /** Pinned value code, or null when the requirement demands breadth instead. */
  valueCode: string | null;
  minimumDistinctValues: number;
}
```

Add `contexts: RequirementContextCheck[];` to `EvidencePolicyCheck`.

Replace the body of `checkObjectiveSatisfaction`'s assertion lookup with a context-aware version:

```ts
  // Assertions are scoped by context. A requirement pinning value V is
  // satisfied by an assertion at V or ANY DESCENDANT of V, because a child
  // value means "evidence here is valid evidence for the parent".
  //
  // This walks structured context rows. It must never compare context_key
  // strings: an assertion keyed cloud_provider=aws_govcloud satisfies a
  // requirement for cloud_provider=aws, and those strings differ.
  const assertionsResult = await db.execute(sql`
    WITH RECURSIVE pinned AS (
      SELECT cv.id, cv.dimension_code
      FROM catalog.context_value cv
      WHERE (cv.dimension_code, cv.code) IN (
        SELECT * FROM unnest(
          ${policy.contexts.filter((c) => c.valueCode !== null).map((c) => c.dimensionCode)}::text[],
          ${policy.contexts.filter((c) => c.valueCode !== null).map((c) => c.valueCode as string)}::text[]
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
          ${policy.contexts.filter((c) => c.valueCode !== null).map((c) => c.dimensionCode)}::text[]
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
```

Leave the observation-scanning block that follows unchanged.

Then in `evaluateRoleState`, load requirement contexts before the evaluation loop:

```ts
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
```

Add `oreq.id` to the `requirementsResult` select list, and pass
`contexts: contextsByRequirement.get(String(row.id)) ?? []` into each
`checkObjectiveSatisfaction` call.

- [ ] **Step 10: Fix the demo's use of the changed return shape**

In `packages/db/src/demo/scenario.ts`, in the "Learner assertions after recalculation" block, replace:

```ts
      const outcome = outcomes.get(ctx.objective(code));
      if (outcome) {
        console.log(`   ${code}: ${outcome.state} (confidence ${outcome.confidence.toFixed(2)})`);
      }
```

with:

```ts
      const outcome = outcomes.get(ctx.objective(code))?.[0];
      if (outcome) {
        console.log(`   ${code}: ${outcome.state} (confidence ${outcome.confidence.toFixed(2)})`);
      }
```

In the lineage query, replace the `assertion_evidence` join (which used the old composite key) with:

```sql
      JOIN learner.assertion_evidence ae ON ae.assertion_id = a.id
```

In the two `checkObjectiveSatisfaction` calls, add `contexts: [],` to each policy object.

- [ ] **Step 11: Generate the migration**

drizzle-kit generates a *new* migration file for each run, but all of Tasks 2-3 is additive DDL that belongs in a single `0003`. Fold it in:

```bash
# Remove the previous 0003 and its journal entry, then regenerate from scratch.
rm packages/db/drizzle/0003_evidence_semantics.sql
# Edit packages/db/drizzle/meta/_journal.json: delete the 0003 entry and the
# 0004 entry, and delete packages/db/drizzle/meta/0003_snapshot.json if present.
pnpm --filter @lighthouse/db db:generate
```

Rename the regenerated file to `0003_evidence_semantics.sql`, set its journal `tag` to `0003_evidence_semantics`, then re-add the `0004_evidence_semantics_governance` journal entry after it. Verify with `pnpm db:reset`.

From Task 4 onward, `0003` is treated as sealed: each later task generates its own numbered migration normally.

- [ ] **Step 12: Run everything**

Run: `pnpm db:reset && pnpm --filter @lighthouse/db test && pnpm --filter @lighthouse/db db:demo`
Expected: tests pass; demo prints `readiness=11.4% (4/35 requirements)` and `1 proxy observation(s) created` exactly as the baseline.

- [ ] **Step 13: Commit**

```bash
git add packages/db/src packages/db/drizzle
git commit -m "feat: scope learner assertions by context"
```

---

## Task 4: First-class objective criteria (additive)

**Files:**
- Modify: `packages/db/src/schema/enums.ts`, `packages/db/src/schema/catalog.ts`, `packages/db/src/schema/assessment.ts`
- Modify: `packages/db/src/services/catalog.ts`, `packages/db/src/services/assessment.ts`
- Create: `packages/db/src/test/criteria.test.ts`

**Interfaces:**
- Consumes: nothing from Tasks 2–3 beyond the schema being present.
- Produces:
  - `interface CriterionInput { code: string; statement: string; kind: "success" | "quality" | "verification" | "process" | "critical_error" }`
  - `ObjectiveInput.criteria: CriterionInput[]` (added alongside the still-present `successCriteria`)
  - `EvidenceSpecSeed.observables[].criterionCodes: string[]`
  - `EvidenceImplicationInput.requiredCriterionCodes: string[]` (alongside the still-present `requiredObservableCodes`)
  - `CatalogSession.criterionIdByCode: Map<string, string>` keyed `"<objectiveCode>:<criterionCode>"`

Additive: old columns stay populated so the seed and demo keep working.

- [ ] **Step 1: Write the failing test**

Create `packages/db/src/test/criteria.test.ts`:

```ts
import { sql } from "drizzle-orm";
import { afterAll, expect, test } from "vitest";
import { withDb } from "./helpers";

const { db, pool } = withDb();
afterAll(async () => { await pool.end(); });

test("RUST-NET-L3-001 has structured criteria including a blocking critical error", async () => {
  const result = await db.execute(sql`
    SELECT c.code, c.kind
    FROM catalog.objective_criterion c
    JOIN catalog.learning_objective_revision lor ON lor.id = c.objective_revision_id
    JOIN catalog.learning_objective lo ON lo.id = lor.learning_objective_id
    WHERE lo.canonical_code = 'RUST-NET-L3-001'
    ORDER BY c.sort_order
  `);
  const codes = result.rows.map((r) => String(r.code));
  expect(codes).toContain("preserve-incomplete-data");
  expect(codes).toContain("no-data-loss");
  const criticalError = result.rows.find((r) => r.code === "no-data-loss");
  expect(criticalError?.kind).toBe("critical_error");
});

test("every direct evidence spec observable maps to at least one criterion", async () => {
  const result = await db.execute(sql`
    SELECT obs.code
    FROM assessment.evidence_spec_observable obs
    JOIN assessment.task_objective_evidence_spec spec ON spec.id = obs.evidence_spec_id
    WHERE spec.evidence_strength = 'direct'
      AND NOT EXISTS (
        SELECT 1 FROM assessment.observable_criterion_mapping m
        WHERE m.evidence_spec_observable_id = obs.id
      )
  `);
  expect(result.rows).toEqual([]);
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `pnpm --filter @lighthouse/db test src/test/criteria.test.ts`
Expected: FAIL — relation `catalog.objective_criterion` does not exist.

- [ ] **Step 3: Add the criterion kind enum**

In `packages/db/src/schema/enums.ts`, after `contextPolicyEnum`, add:

```ts
export const criterionKindEnum = catalogSchema.enum("criterion_kind", [
  "success",
  "quality",
  "verification",
  "process",
  "critical_error",
]);
```

- [ ] **Step 4: Add the criterion table**

In `packages/db/src/schema/catalog.ts`, after `objectiveContextAllowedValue`, add:

```ts
// ---------------------------------------------------------------------------
// Objective criteria — the missing middle layer between a capability claim and
// the assessments that observe it.
//
// `code` is stable within the objective's LINEAGE, not merely within the
// revision. That is what later lets objective_revision_transition say
// "criteria unchanged -> evidence_carries_forward".
//
// A `critical_error` criterion is blocking by definition; there is no severity
// column, because a value the evaluator ignores is worse than no value at all.
// ---------------------------------------------------------------------------

export const objectiveCriterion = catalogSchema.table(
  "objective_criterion",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    objectiveRevisionId: uuid("objective_revision_id")
      .notNull()
      .references(() => learningObjectiveRevision.id),
    code: text("code").notNull(),
    statement: text("statement").notNull(),
    kind: criterionKindEnum("kind").notNull(),
    sortOrder: integer("sort_order"),
  },
  (t) => [unique("uq_objective_criterion_code").on(t.objectiveRevisionId, t.code)],
);
```

Import `criterionKindEnum` from `./enums`.

- [ ] **Step 5: Add the implication-criterion join table**

In `packages/db/src/schema/catalog.ts`, after `objectiveEvidenceImplication`, add:

```ts
export const objectiveEvidenceImplicationCriterion = catalogSchema.table(
  "objective_evidence_implication_criterion",
  {
    implicationId: uuid("implication_id")
      .notNull()
      .references(() => objectiveEvidenceImplication.id),
    objectiveCriterionId: uuid("objective_criterion_id")
      .notNull()
      .references(() => objectiveCriterion.id),
  },
  (t) => [primaryKey({ columns: [t.implicationId, t.objectiveCriterionId] })],
);
```

- [ ] **Step 6: Add the observable-criterion mapping**

In `packages/db/src/schema/assessment.ts`, after `evidenceSpecObservable`, add:

```ts
// Many-to-many on purpose. One hidden executable test can establish several
// criteria at once, and one criterion can be established by several
// independent observables — an automated check plus a human rubric item.
export const observableCriterionMapping = assessmentSchema.table(
  "observable_criterion_mapping",
  {
    evidenceSpecObservableId: uuid("evidence_spec_observable_id")
      .notNull()
      .references(() => evidenceSpecObservable.id),
    objectiveCriterionId: uuid("objective_criterion_id")
      .notNull()
      .references(() => objectiveCriterion.id),
  },
  (t) => [
    primaryKey({ columns: [t.evidenceSpecObservableId, t.objectiveCriterionId] }),
  ],
);
```

Import `objectiveCriterion` from `./catalog`.

- [ ] **Step 7: Accept criteria in the catalog service**

In `packages/db/src/services/catalog.ts`, add above `ObjectiveInput`:

```ts
export interface CriterionInput {
  code: string;
  statement: string;
  kind: "success" | "quality" | "verification" | "process" | "critical_error";
}
```

Add `criteria: CriterionInput[];` to `ObjectiveInput`. Add to `CatalogSession`:

```ts
  /** "<objectiveCode>:<criterionCode>" -> objective_criterion.id */
  readonly criterionIdByCode = new Map<string, string>();
```

Inside `createObjective`'s transaction, after the `competencyObjectiveMembership` insert, add:

```ts
      for (const [index, criterion] of input.criteria.entries()) {
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
```

Declare `const criterionIds: Array<[string, string]> = [];` immediately before the transaction and, after it returns, populate the map:

```ts
    for (const [key, id] of criterionIds) this.criterionIdByCode.set(key, id);
```

Add a lookup:

```ts
  requireCriterion(objectiveCode: string, criterionCode: string): string {
    const id = this.criterionIdByCode.get(`${objectiveCode}:${criterionCode}`);
    if (!id) throw new Error(`unknown criterion ${objectiveCode}:${criterionCode}`);
    return id;
  }
```

- [ ] **Step 8: Accept required criteria on implications**

In `packages/db/src/services/catalog.ts`, add `requiredCriterionCodes?: string[];` to `EvidenceImplicationInput`, and in `createEvidenceImplication` capture the inserted id and write the join rows:

```ts
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
```

- [ ] **Step 9: Accept criterion mappings on observables**

In `packages/db/src/seed/data/tasks.ts`, add `criterionCodes?: string[];` to `ObservableSeed`.

In `packages/db/src/services/assessment.ts`, change `createTask`'s signature to accept the criterion lookup, because observables map to criteria on the objective the spec targets:

```ts
export async function createTask(
  db: Database,
  frameworkReleaseId: string,
  seed: TaskSeed,
  criterionIdByCode: ReadonlyMap<string, string>,
): Promise<CreatedTask> {
```

In the observables loop, replace the insert with:

```ts
      for (const [index, observable] of (spec.observables ?? []).entries()) {
        const [createdObservable] = await tx
          .insert(s.evidenceSpecObservable)
          .values({
            evidenceSpecId: createdSpec.id,
            code: observable.code,
            statement: observable.statement,
            observableType: observable.observableType,
            critical: observable.critical,
            sortOrder: index,
          })
          .returning({ id: s.evidenceSpecObservable.id });
        if (!createdObservable) throw new Error(`failed to insert observable ${observable.code}`);

        for (const criterionCode of observable.criterionCodes ?? []) {
          const key = `${spec.objectiveCode}:${criterionCode}`;
          const criterionId = criterionIdByCode.get(key);
          if (!criterionId) throw new Error(`unknown criterion ${key}`);
          await tx.insert(s.observableCriterionMapping).values({
            evidenceSpecObservableId: createdObservable.id,
            objectiveCriterionId: criterionId,
          });
        }
      }
```

In `packages/db/src/seed/index.ts`, update the call site:

```ts
    const task = await createTask(db, releaseId, rustFramingChallenge, session.criterionIdByCode);
```

- [ ] **Step 10: Add the criterion-coverage publication check**

In `packages/db/src/services/publication.ts`, inside `validateRelease` before the `return`, add:

```ts
  // §2: `direct` means claim-complete, so a direct spec must be able to observe
  // EVERY criterion of its objective — critical errors included. A task that
  // cannot detect data loss is a supporting task, not a direct one.
  const uncoveredCriteria = await db.execute(sql`
    SELECT lo.canonical_code, c.code AS criterion_code
    FROM assessment.task_objective_evidence_spec spec
    JOIN catalog.learning_objective_revision lor ON lor.id = spec.objective_revision_id
    JOIN catalog.learning_objective lo ON lo.id = lor.learning_objective_id
    JOIN catalog.framework_release_objective fro
      ON fro.objective_revision_id = lor.id AND fro.framework_release_id = ${frameworkReleaseId}
    JOIN catalog.objective_criterion c ON c.objective_revision_id = lor.id
    WHERE spec.evidence_strength = 'direct'
      AND NOT EXISTS (
        SELECT 1
        FROM assessment.observable_criterion_mapping m
        JOIN assessment.evidence_spec_observable obs ON obs.id = m.evidence_spec_observable_id
        WHERE obs.evidence_spec_id = spec.id AND m.objective_criterion_id = c.id
      )
  `);
  for (const row of uncoveredCriteria.rows) {
    errors.push(
      `direct evidence spec for ${row.canonical_code} does not observe criterion ${row.criterion_code}`,
    );
  }

  // §5: the verb dictionary must govern, not merely document.
  const verbLevelMismatches = await db.execute(sql`
    SELECT lo.canonical_code, lor.verb_code, lor.mastery_level
    FROM catalog.framework_release_objective fro
    JOIN catalog.learning_objective_revision lor ON lor.id = fro.objective_revision_id
    JOIN catalog.learning_objective lo ON lo.id = lor.learning_objective_id
    JOIN catalog.verb_definition v ON v.code = lor.verb_code
    WHERE fro.framework_release_id = ${frameworkReleaseId}
      AND NOT (lor.mastery_level = ANY(v.allowed_mastery_levels))
  `);
  for (const row of verbLevelMismatches.rows) {
    errors.push(
      `objective ${row.canonical_code} uses verb ${row.verb_code} at L${row.mastery_level}, which the verb does not allow`,
    );
  }

  // Every objective must carry at least one non-critical-error criterion.
  const criterionlessObjectives = await db.execute(sql`
    SELECT lo.canonical_code
    FROM catalog.framework_release_objective fro
    JOIN catalog.learning_objective_revision lor ON lor.id = fro.objective_revision_id
    JOIN catalog.learning_objective lo ON lo.id = lor.learning_objective_id
    WHERE fro.framework_release_id = ${frameworkReleaseId}
      AND NOT EXISTS (
        SELECT 1 FROM catalog.objective_criterion c
        WHERE c.objective_revision_id = lor.id AND c.kind <> 'critical_error'
      )
  `);
  for (const row of criterionlessObjectives.rows) {
    errors.push(`objective ${row.canonical_code} has no non-critical-error criterion`);
  }
```

- [ ] **Step 11: Give every seeded objective an empty criteria array for now**

`ObjectiveInput.criteria` is required, so add `criteria: [],` to every object in `packages/db/src/seed/data/objectives.ts`. Task 5 fills them in. Because `validateRelease` now rejects criterion-less objectives, temporarily this makes `db:reset` fail — so **Task 5 must be completed in the same working session**; do not commit between 4 and 5 with a red `db:reset`. If you prefer a green commit here, do Steps 1–10 only and defer Step 11 into Task 5.

**Recommended:** defer Step 11 to Task 5 and commit Task 4 green.

- [ ] **Step 12: Verify green and commit**

Run: `pnpm db:reset && pnpm lint && pnpm check-types`
Expected: all clean (criteria tests still fail — they pass in Task 5).

```bash
git add packages/db/src packages/db/drizzle
git commit -m "feat: add objective criteria, observable mappings, and coverage validation"
```

---

## Task 5: Seed criteria for all 39 objectives

**Files:**
- Modify: `packages/db/src/seed/data/objectives.ts` (all 39 objectives)
- Modify: `packages/db/src/seed/data/tasks.ts`, `packages/db/src/seed/data/relationships.ts`

**Interfaces:**
- Consumes: `CriterionInput` (Task 4).
- Produces: seeded criteria and mappings that Task 6's proxy gate reads.

**Conversion rule — apply mechanically to every objective:**

For each objective, replace `successCriteria: string[]` and `criticalErrors?: string[]` with a single `criteria: CriterionInput[]`:

1. Each `successCriteria` entry becomes `{ code, statement, kind: "success" }`. `statement` is the existing string verbatim. `code` is a kebab-case slug of 2–4 words capturing the criterion, unique within the objective.
2. Each `criticalErrors` entry becomes `{ code, statement, kind: "critical_error" }` — but **restated positively**, because observable results are always positive. `"discards incomplete frame bytes"` becomes statement `"Does not discard incomplete frame bytes"` with code `no-discarded-bytes`.
3. Keep `successCriteria` and `criticalErrors` in place for now; Task 7 drops them.

- [ ] **Step 1: Convert RUST-NET-L3-001**

In `packages/db/src/seed/data/objectives.ts`, add to the `RUST-NET-L3-001` object:

```ts
    criteria: [
      {
        code: "preserve-incomplete-data",
        statement: "Incomplete frame data is preserved across arbitrary read boundaries",
        kind: "success",
      },
      {
        code: "multiple-frames-per-read",
        statement: "Multiple complete frames within one read are all processed",
        kind: "success",
      },
      {
        code: "split-header-and-body",
        statement: "Frame headers and bodies split across reads are handled",
        kind: "success",
      },
      {
        code: "eof-and-io-errors",
        statement: "EOF and I/O errors are handled according to protocol state",
        kind: "success",
      },
      {
        code: "no-data-loss",
        statement: "No bytes are lost, duplicated, or reordered",
        kind: "critical_error",
      },
      {
        code: "boundary-verification",
        statement: "Behavior is verified with tests covering varied read boundaries",
        kind: "verification",
      },
    ],
```

- [ ] **Step 2: Convert RUST-NET-L2-003**

Its `criticalErrors` are `["assumes one read returns one complete message", "discards bytes from an incomplete unit"]`. Add:

```ts
    criteria: [
      {
        code: "no-one-read-one-message",
        statement: "Does not assume one read returns one complete message",
        kind: "critical_error",
      },
      {
        code: "no-discarded-bytes",
        statement: "Does not discard bytes from an incomplete unit",
        kind: "critical_error",
      },
      // plus one `success` criterion per existing successCriteria entry,
      // following the conversion rule above.
    ],
```

- [ ] **Step 3: Convert the remaining 37 objectives**

Apply the conversion rule to every other entry in the file. The seven other objectives with `criticalErrors` are at lines 232, 264, 379, 414 and the RUST-NET-L2-003/L3-001 pair already done — restate each positively. Every objective must end with at least one non-`critical_error` criterion, or `validateRelease` rejects the release.

- [ ] **Step 4: Map the task's observables to criteria**

In `packages/db/src/seed/data/tasks.ts`, add `criterionCodes` to each observable of the `RUST-NET-L3-001` spec:

```
framing-model        -> []                            (context-setting, maps to nothing)
buffer-preservation  -> ["preserve-incomplete-data"]
multiple-frames      -> ["multiple-frames-per-read"]
partial-header       -> ["split-header-and-body"]
partial-body         -> ["split-header-and-body"]
eof                  -> ["eof-and-io-errors"]
io-error             -> ["eof-and-io-errors"]
verification         -> ["boundary-verification"]
data-integrity       -> ["no-data-loss"]
```

`framing-model` maps to nothing, which means the direct spec would fail criterion coverage only if some criterion were left unmapped — coverage is checked criterion-side, not observable-side, so an unmapped observable is fine. Every one of the six criteria above is covered.

- [ ] **Step 5: Move the implication onto criteria**

In `packages/db/src/seed/data/relationships.ts`, add to the `RUST-NET-L3-001 -> RUST-NET-L2-003` implication:

```ts
    requiredCriterionCodes: [
      "preserve-incomplete-data",
      "multiple-frames-per-read",
      "split-header-and-body",
    ],
```

Keep `requiredObservableCodes` for now — Task 6 switches the gate over, Task 7 drops the column.

Note the equivalence being preserved: the old gate required `buffer-preservation`, `multiple-frames`, `partial-header`, `partial-body`, and `data-integrity` to succeed. The three criteria above cover the first four; `data-integrity` is now enforced by the `no-data-loss` critical-error gate, which applies to every rule automatically.

- [ ] **Step 6: Reset and run the tests**

Run: `pnpm db:reset && pnpm --filter @lighthouse/db test`
Expected: `db:reset` publishes the release with no new errors; both `criteria.test.ts` tests now pass.

- [ ] **Step 7: Commit**

```bash
git add packages/db/src/seed
git commit -m "feat: convert all seeded objectives to first-class criteria"
```

---

## Task 6: Rewrite the proxy gate onto criteria

**Files:**
- Modify: `packages/db/src/services/evidence.ts`
- Modify: `packages/db/src/test/criteria.test.ts`

**Interfaces:**
- Consumes: `objectiveEvidenceImplicationCriterion`, `observableCriterionMapping` (Task 4).
- Produces:
  - `interface CriterionOutcomeSummary { established: Set<string>; observed: Set<string>; triggeredCriticalErrorCodes: string[] }`
  - `summarizeCriterionOutcomes(db, observationId): Promise<CriterionOutcomeSummary>`

**This is the highest-risk change in the pass.** The failure mode is vacuous success: an attempt whose observables carry no criterion mappings yields an empty set, and a check phrased as "no failures found" passes for free.

- [ ] **Step 1: Write the failing tests**

Append to `packages/db/src/test/criteria.test.ts`:

```ts
import { propagateFromObservation, recordObservation } from "../services/evidence";
import { createLearner, objectiveId } from "./helpers";

async function specIdFor(objectiveCode: string): Promise<string> {
  const result = await db.execute(sql`
    SELECT spec.id
    FROM assessment.task_objective_evidence_spec spec
    JOIN catalog.learning_objective_revision lor ON lor.id = spec.objective_revision_id
    JOIN catalog.learning_objective lo ON lo.id = lor.learning_objective_id
    WHERE lo.canonical_code = ${objectiveCode}
  `);
  const id = result.rows[0]?.id;
  if (typeof id !== "string") throw new Error(`no spec for ${objectiveCode}`);
  return id;
}

test("propagation fails when a required criterion has no successful observable", async () => {
  const learnerId = await createLearner(db, "vacuous-guard");
  const observationId = await recordObservation(db, {
    learnerId,
    objectiveRevisionId: await objectiveId(db, "RUST-NET-L3-001"),
    evidenceSpecId: await specIdFor("RUST-NET-L3-001"),
    result: "successful",
    evidenceStrength: "direct",
    independenceLevel: 3,
    transferLevel: "near",
    // Deliberately NO observable results: nothing is established.
    observableResults: [],
  });

  const propagation = await propagateFromObservation(db, observationId);
  expect(propagation.createdProxyObservationIds).toEqual([]);
  expect(propagation.skipped.some((s) => /criteri/i.test(s.reason))).toBe(true);
});

test("propagation fails when a critical-error criterion is triggered", async () => {
  const learnerId = await createLearner(db, "critical-error-guard");
  const observationId = await recordObservation(db, {
    learnerId,
    objectiveRevisionId: await objectiveId(db, "RUST-NET-L3-001"),
    evidenceSpecId: await specIdFor("RUST-NET-L3-001"),
    result: "successful",
    evidenceStrength: "direct",
    independenceLevel: 3,
    transferLevel: "near",
    observableResults: [
      { code: "buffer-preservation", result: "successful" },
      { code: "multiple-frames", result: "successful" },
      { code: "partial-header", result: "successful" },
      { code: "partial-body", result: "successful" },
      // Positive polarity: data-integrity FAILING means data WAS lost.
      { code: "data-integrity", result: "unsuccessful" },
    ],
  });

  const propagation = await propagateFromObservation(db, observationId);
  expect(propagation.createdProxyObservationIds).toEqual([]);
  expect(propagation.skipped.some((s) => /critical/i.test(s.reason))).toBe(true);
});
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `pnpm --filter @lighthouse/db test src/test/criteria.test.ts`
Expected: the vacuous-guard test FAILS — the current gate propagates because `required_observable_codes` finds no failures. The critical-error test may already pass via the old `obs.critical` guard; it must keep passing after the rewrite.

- [ ] **Step 3: Add the criterion outcome summary**

In `packages/db/src/services/evidence.ts`, add above `propagateFromObservation`:

```ts
export interface CriterionOutcomeSummary {
  /** Criterion ids with at least one mapped observable result of 'successful'. */
  established: Set<string>;
  /** Criterion ids with at least one mapped observable result of any kind. */
  observed: Set<string>;
  /** Codes of critical_error criteria whose mapped observable did not succeed. */
  triggeredCriticalErrorCodes: string[];
}

/**
 * Resolve one observation's observable results up to the criteria they establish.
 *
 * Polarity is always positive: `successful` means the good outcome obtained.
 * For a critical_error criterion that means the error was AVOIDED, so an
 * `unsuccessful` result on a mapped observable is what fires it.
 */
export async function summarizeCriterionOutcomes(
  db: Database,
  observationId: string,
): Promise<CriterionOutcomeSummary> {
  const rows = await db.execute(sql`
    SELECT c.id, c.code, c.kind, r.result
    FROM evidence.observable_result r
    JOIN assessment.evidence_spec_observable obs
      ON obs.evidence_spec_id = r.evidence_spec_id AND obs.code = r.observable_code
    JOIN assessment.observable_criterion_mapping m
      ON m.evidence_spec_observable_id = obs.id
    JOIN catalog.objective_criterion c ON c.id = m.objective_criterion_id
    WHERE r.evidence_observation_id = ${observationId}
  `);

  const established = new Set<string>();
  const observed = new Set<string>();
  const triggeredCriticalErrorCodes: string[] = [];

  for (const row of rows.rows) {
    const criterionId = String(row.id);
    observed.add(criterionId);
    if (row.result === "successful") {
      established.add(criterionId);
    } else if (row.kind === "critical_error") {
      triggeredCriticalErrorCodes.push(String(row.code));
    }
  }

  return { established, observed, triggeredCriticalErrorCodes };
}
```

- [ ] **Step 4: Replace the critical-observable guard**

In `propagateFromObservation`, replace the whole `criticalFailures` block with:

```ts
  const outcomes = await summarizeCriterionOutcomes(db, observationId);

  // A triggered critical-error criterion blocks every rule from this evidence.
  if (outcomes.triggeredCriticalErrorCodes.length > 0) {
    result.skipped.push({
      targetObjectiveCode: "*",
      reason: `critical-error criteria triggered: ${outcomes.triggeredCriticalErrorCodes.join(", ")}`,
    });
    return result;
  }
```

- [ ] **Step 5: Replace the required-observable gate with positive criterion establishment**

Inside the `for (const rule of rules.rows)` loop, replace the `requiredCodes` block with:

```ts
    // Required criteria are resolved from the rule, not from task-local
    // observable names. The gate demands POSITIVE establishment: it is not
    // enough that nothing failed — an attempt with no mapped observables at
    // all must not propagate.
    const requiredCriteria = await db.execute(sql`
      SELECT c.id, c.code
      FROM catalog.objective_evidence_implication_criterion ic
      JOIN catalog.objective_criterion c ON c.id = ic.objective_criterion_id
      WHERE ic.implication_id = ${rule.id}
    `);

    const unestablished = requiredCriteria.rows
      .filter((row) => !outcomes.established.has(String(row.id)))
      .map((row) => String(row.code));

    if (unestablished.length > 0) {
      result.skipped.push({
        targetObjectiveCode: targetCode,
        reason: `required criteria not established: ${unestablished.join(", ")}`,
      });
      continue;
    }
```

In the proxy insert's `details`, replace `requiredObservableCodes: requiredCodes` with:

```ts
          requiredCriterionCodes: requiredCriteria.rows.map((row) => String(row.code)),
```

- [ ] **Step 6: Update the demo's lineage output**

In `packages/db/src/demo/scenario.ts`, in the lineage query change
`o.details->'requiredObservableCodes' AS gated_observables` to
`o.details->'requiredCriterionCodes' AS gated_criteria`, and change the print to:

```ts
        console.log(`   gated by criteria: ${JSON.stringify(row.gated_criteria)}`);
```

- [ ] **Step 7: Run the tests and the demo**

Run: `pnpm db:reset && pnpm --filter @lighthouse/db test && pnpm --filter @lighthouse/db db:demo`
Expected: all tests pass. The demo still prints `1 proxy observation(s) created` and `RUST-NET-L2-003: demonstrated (confidence 0.85)`. The `gated by` line now lists criteria instead of observables — that is the only allowed change in this task's diff.

- [ ] **Step 8: Commit**

```bash
git add packages/db/src
git commit -m "feat: gate proxy propagation on objective criteria, not observable names"
```

---

## Task 7: Contract — drop the replaced columns

**Files:**
- Modify: `packages/db/src/schema/catalog.ts`, `packages/db/src/schema/assessment.ts`
- Modify: `packages/db/src/services/catalog.ts`, `packages/db/src/services/assessment.ts`, `packages/db/src/services/publication.ts`
- Modify: `packages/db/src/seed/data/objectives.ts`, `packages/db/src/seed/data/tasks.ts`, `packages/db/src/seed/data/relationships.ts`

**Interfaces:**
- Produces: no new signatures; removes `ObjectiveInput.successCriteria`, `ObjectiveInput.criticalErrors`, `EvidenceImplicationInput.requiredObservableCodes`, `EvidenceImplicationInput.transitive`, `EvidenceSpecSeed.directEvidenceRequired`, `ObservableSeed.critical`.

**Decision recorded here because it is a behavior change hidden inside a refactor:** `evidence_spec_observable.critical` is dropped. Criterion `kind` becomes the *only* source of criticality. The seed currently flags five observables critical; four of them (`buffer-preservation`, `multiple-frames`, `partial-header`, `partial-body`) map to `success` criteria that the implication already requires, and the fifth (`data-integrity`) maps to the `no-data-loss` critical-error criterion. Propagation behavior is therefore preserved — and Task 6's two tests are what prove it.

- [ ] **Step 1: Remove the columns from the schema**

- `packages/db/src/schema/catalog.ts`: delete `successCriteria` and `criticalErrors` from `learningObjectiveRevision`; delete `requiredObservableCodes` and `transitive` from `objectiveEvidenceImplication`.
- `packages/db/src/schema/assessment.ts`: delete `directEvidenceRequired` from `taskObjectiveEvidenceSpec`; delete `critical` from `evidenceSpecObservable`.

- [ ] **Step 2: Remove them from the services**

- `packages/db/src/services/catalog.ts`: delete `successCriteria`, `criticalErrors` from `ObjectiveInput` and the `createObjective` insert; delete `requiredObservableCodes`, `transitive` from `EvidenceImplicationInput` and the `createEvidenceImplication` insert.
- `packages/db/src/services/assessment.ts`: delete `directEvidenceRequired` from the spec insert and `critical` from the observable insert.
- `packages/db/src/services/evidence.ts`: delete the `if (rule.transitive === true)` recursion block and the `options?: { fromProxy?: boolean }` parameter, along with the `if (observation.origin === "proxy" && !options?.fromProxy) return result;` guard — replace it with an unconditional `if (observation.origin === "proxy") return result;` and this comment:

```ts
  // Proxy evidence never propagates further. Explicit one-hop implications
  // only: an L4 task establishing L3 by proxy does not thereby establish L2.
  // If it genuinely can, author the L4 -> L2 rule.
```

- [ ] **Step 3: Remove the old publication checks that the new ones replace**

In `packages/db/src/services/publication.ts`, delete the `incompleteObjectives` check's `jsonb_array_length(lor.success_criteria) = 0` clause (keep the title/statement checks) and delete the `badSubsumes` check that reads `cardinality(i.required_observable_codes)`, replacing it with:

```ts
  // §13.3 fully_subsumes requires rationale and at least one required criterion.
  const badSubsumes = await db.execute(sql`
    SELECT i.id
    FROM catalog.objective_evidence_implication i
    WHERE i.framework_release_id = ${frameworkReleaseId}
      AND i.implication_type = 'fully_subsumes'
      AND (
        i.rationale = ''
        OR NOT EXISTS (
          SELECT 1 FROM catalog.objective_evidence_implication_criterion ic
          WHERE ic.implication_id = i.id
        )
      )
  `);
  for (const row of badSubsumes.rows) {
    errors.push(`fully_subsumes implication ${row.id} lacks rationale or required criteria`);
  }
```

- [ ] **Step 4: Remove them from the seed**

Delete every `successCriteria:` and `criticalErrors:` key from `objectives.ts`, every `critical:` key from the observables in `tasks.ts`, `directEvidenceRequired:` from the `RUST-NET-L3-001` spec in `tasks.ts`, and `requiredObservableCodes:` from `relationships.ts`.

- [ ] **Step 5: Generate the contract migration**

Run: `pnpm --filter @lighthouse/db db:generate`
Expected: a new file containing only `ALTER TABLE ... DROP COLUMN`. Rename it `0005_evidence_semantics_contract.sql` and update its journal `tag`.

- [ ] **Step 6: Verify**

Run: `pnpm db:reset && pnpm --filter @lighthouse/db test && pnpm lint && pnpm check-types && pnpm --filter @lighthouse/db db:demo`
Expected: all green; demo output unchanged from Task 6.

- [ ] **Step 7: Commit**

```bash
git add packages/db
git commit -m "refactor: drop success criteria JSON, observable codes, transitivity, and task-level direct flag"
```

---

## Task 8: Split transfer distance from performance scope

**Files:**
- Modify: `packages/db/src/schema/enums.ts`, `packages/db/src/schema/evidence.ts`, `packages/db/src/schema/assessment.ts`, `packages/db/src/schema/qualification.ts`
- Modify: `packages/db/src/services/policy.ts`, `packages/db/src/services/evidence.ts`, `packages/db/src/services/role-state.ts`, `packages/db/src/services/role-compiler.ts`, `packages/db/src/services/assessment.ts`
- Modify: `packages/db/src/seed/data/tasks.ts`, `packages/db/src/demo/scenario.ts`

**Interfaces:**
- Produces:
  - `transferDistanceEnum` (`same | near | far`), `performanceScopeEnum` (`focused | composite | integrated`)
  - `type TransferDistance`, `type PerformanceScope`, `transferDistanceAtLeast(actual, minimum)`, `performanceScopeAtLeast(actual, minimum)`
  - `RecordObservationInput.transferDistance: TransferDistance`, `.performanceScope: PerformanceScope` (replacing `transferLevel`)
  - `EvidencePolicyCheck.minimumTransferDistance`, `.minimumPerformanceScope`
  - `ObjectivePolicy.minimumTransferDistance`, `.minimumPerformanceScope`

Because `transfer_level` is used in five places, this is a rename-and-split, not an expand/contract: do it in one commit and let `db:generate` produce the column changes.

- [ ] **Step 1: Replace the enums**

In `packages/db/src/schema/enums.ts`, delete `transferLevelEnum` and add:

```ts
// Transfer distance and performance scope are independent. Far transfer of one
// focused capability into an unfamiliar runtime is not the same thing as an
// integrated mission in a familiar environment, and neither dominates.
//
// `performance_scope`, not `integration_scope`, and deliberately not
// `mission_integrated`: a mission is an assessment FORMAT, not a property of
// evidence. Integrated evidence can come from something that is not a mission,
// and a mission can contain a focused sub-assessment.
export const transferDistanceEnum = evidenceSchema.enum("transfer_distance", [
  "same",
  "near",
  "far",
]);

export const performanceScopeEnum = evidenceSchema.enum("performance_scope", [
  "focused",
  "composite",
  "integrated",
]);
```

- [ ] **Step 2: Update every column**

- `evidence.ts` / `observation`: replace `transferLevel: transferLevelEnum("transfer_level")` with
  `transferDistance: transferDistanceEnum("transfer_distance").notNull()` and
  `performanceScope: performanceScopeEnum("performance_scope").notNull().default("focused")`.
- `assessment.ts` / `taskVariant`: replace `noveltyDefault` with
  `transferDistanceDefault: transferDistanceEnum("transfer_distance_default").notNull().default("same")` and
  `performanceScopeDefault: performanceScopeEnum("performance_scope_default").notNull().default("focused")`.
- `assessment.ts` / `taskObjectiveEvidenceSpec`: replace `minimumTransfer` with
  `minimumTransferDistance: transferDistanceEnum("minimum_transfer_distance").notNull().default("same")` and
  `minimumPerformanceScope: performanceScopeEnum("minimum_performance_scope").notNull().default("focused")`.
- `qualification.ts` / `objectiveRequirement`: replace `minimumTransfer` with nullable
  `minimumTransferDistance: transferDistanceEnum("minimum_transfer_distance")` and
  `minimumPerformanceScope: performanceScopeEnum("minimum_performance_scope")`.

- [ ] **Step 3: Update the policy orderings**

In `packages/db/src/services/policy.ts`, replace `transferOrder`, `TransferLevel`, and `transferAtLeast` with:

```ts
export const transferDistanceOrder = { same: 0, near: 1, far: 2 } as const;
export const performanceScopeOrder = { focused: 0, composite: 1, integrated: 2 } as const;

export type TransferDistance = keyof typeof transferDistanceOrder;
export type PerformanceScope = keyof typeof performanceScopeOrder;

export function transferDistanceAtLeast(
  actual: TransferDistance,
  minimum: TransferDistance,
): boolean {
  return transferDistanceOrder[actual] >= transferDistanceOrder[minimum];
}

export function performanceScopeAtLeast(
  actual: PerformanceScope,
  minimum: PerformanceScope,
): boolean {
  return performanceScopeOrder[actual] >= performanceScopeOrder[minimum];
}
```

In `inferencePolicy`, rename `bonusTransferNearOrBetter` usage: in `assertions.ts` change
`if (best.transfer_level !== "same")` to `if (best.transfer_distance !== "same")` and update `ObservationRow` accordingly.

- [ ] **Step 4: Update the services**

- `evidence.ts`: `RecordObservationInput` gains `transferDistance: "same" | "near" | "far"` and `performanceScope: "focused" | "composite" | "integrated"`, replacing `transferLevel`. Update the insert, and the proxy insert (which copies `observation.transfer_distance` and `observation.performance_scope`).
- `role-state.ts`: `EvidencePolicyCheck` replaces `minimumTransfer: TransferLevel | null` with `minimumTransferDistance: TransferDistance | null` and `minimumPerformanceScope: PerformanceScope | null`. In the observation loop replace the single transfer check with both checks. Update the `requirementsResult` query to select both columns.
- `role-compiler.ts`: `ObjectivePolicy` replaces `minimumTransfer` with both fields; defaults become `minimumTransferDistance: policy.minimumTransferDistance ?? "near"` and `minimumPerformanceScope: policy.minimumPerformanceScope ?? "focused"`.
- `assessment.ts`: the spec insert writes both new columns from the seed.

- [ ] **Step 5: Update the seed and demo**

- `tasks.ts`: `EvidenceSpecSeed.minimumTransfer` becomes `minimumTransferDistance` + `minimumPerformanceScope`; variant `noveltyDefault: "near"` becomes `transferDistanceDefault: "near", performanceScopeDefault: "focused"`. The `variant-split-header` variant, being an unfamiliar repo requiring several capabilities together, gets `performanceScopeDefault: "composite"`.
- `demo/scenario.ts`: every `recordObservation` call replaces `transferLevel: "near"` with `transferDistance: "near", performanceScope: "focused"`; the framing-challenge direct evidence uses `performanceScope: "composite"`. Both `checkObjectiveSatisfaction` policy objects replace `minimumTransfer: "near"` with `minimumTransferDistance: "near", minimumPerformanceScope: "focused"`.

- [ ] **Step 6: Update the tests written in earlier tasks**

`src/test/context.test.ts` (Task 3) and `src/test/criteria.test.ts` (Task 6) both call `recordObservation` with `transferLevel: "near"`. Replace every occurrence with:

```ts
    transferDistance: "near",
    performanceScope: "focused",
```

- [ ] **Step 7: Generate, verify, commit**

Run: `pnpm --filter @lighthouse/db db:generate && pnpm db:reset && pnpm --filter @lighthouse/db test && pnpm lint && pnpm check-types && pnpm --filter @lighthouse/db db:demo`
Expected: all green; demo readiness still `11.4% (4/35)`.

```bash
git add packages/db
git commit -m "feat: separate transfer distance from performance scope"
```

---

## Task 9: Evidence ceiling on the administration

**Files:**
- Modify: `packages/db/src/schema/assessment.ts`, `packages/db/src/services/assessment.ts`, `packages/db/src/services/evidence.ts`
- Modify: `packages/db/src/seed/data/tasks.ts`
- Modify: `packages/db/drizzle/0004_evidence_semantics_governance.sql`
- Create: `packages/db/src/test/ceiling.test.ts`

**Interfaces:**
- Produces: `taskRevision.designEvidenceCeiling`, `taskAdministration.effectiveEvidenceCeiling`, `TaskSeed.designEvidenceCeiling`, `TaskSeed.administrations[].effectiveEvidenceCeiling`.

- [ ] **Step 1: Write the failing test**

Create `packages/db/src/test/ceiling.test.ts`:

```ts
import { sql } from "drizzle-orm";
import { afterAll, expect, test } from "vitest";
import * as s from "../schema/index";
import { recordObservation } from "../services/evidence";
import { createLearner, objectiveId, withDb } from "./helpers";

const { db, pool } = withDb();
afterAll(async () => { await pool.end(); });

test("an L2-ceiling administration cannot establish an L3 objective", async () => {
  const learnerId = await createLearner(db, "ceiling-guard");

  const administration = await db.execute(sql`
    SELECT ta.id FROM assessment.task_administration ta
    WHERE ta.mode = 'practice' AND ta.effective_evidence_ceiling = 2
    LIMIT 1
  `);
  const administrationId = administration.rows[0]?.id;
  if (typeof administrationId !== "string") throw new Error("no L2 practice administration seeded");

  const [attempt] = await db
    .insert(s.learnerAttempt)
    .values({ learnerId, taskAdministrationId: administrationId, attemptStatus: "completed" })
    .returning({ id: s.learnerAttempt.id });
  if (!attempt) throw new Error("failed to create attempt");

  await expect(
    recordObservation(db, {
      learnerId,
      attemptId: attempt.id,
      objectiveRevisionId: await objectiveId(db, "RUST-NET-L3-001"),
      result: "successful",
      evidenceStrength: "direct",
      independenceLevel: 3,
      transferDistance: "near",
      performanceScope: "focused",
    }),
  ).rejects.toThrow(/ceiling/i);
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `pnpm --filter @lighthouse/db test src/test/ceiling.test.ts`
Expected: FAIL — column `effective_evidence_ceiling` does not exist.

- [ ] **Step 3: Rename and add the columns**

In `packages/db/src/schema/assessment.ts`:

- `taskRevision`: rename `evidenceCeiling` to
  `designEvidenceCeiling: smallint("design_evidence_ceiling").notNull()` and update its check constraint name to `ck_task_design_evidence_ceiling` over `design_evidence_ceiling`.
- `taskAdministration`: add

```ts
    // The ceiling given the assistance PERMITTED by this administration, not
    // the assistance actually consumed. A practice run with hints available
    // carries the reduced ceiling even if the learner never opens a hint.
    effectiveEvidenceCeiling: smallint("effective_evidence_ceiling").notNull(),
```

with `check("ck_administration_effective_ceiling", sql\`effective_evidence_ceiling BETWEEN 1 AND 5\`)`.

- [ ] **Step 4: Add the cross-table trigger**

Append to `packages/db/drizzle/0004_evidence_semantics_governance.sql`:

```sql
--> statement-breakpoint

-- An administration can never support more than the task was designed for.
CREATE OR REPLACE FUNCTION governance.enforce_administration_ceiling()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  design_ceiling smallint;
BEGIN
  SELECT tr.design_evidence_ceiling INTO design_ceiling
  FROM assessment.task_variant tv
  JOIN assessment.task_revision tr ON tr.id = tv.task_revision_id
  WHERE tv.id = NEW.task_variant_id;

  IF NEW.effective_evidence_ceiling > design_ceiling THEN
    RAISE EXCEPTION 'administration effective ceiling L% exceeds task design ceiling L%',
      NEW.effective_evidence_ceiling, design_ceiling;
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER trg_administration_ceiling
BEFORE INSERT OR UPDATE ON assessment.task_administration
FOR EACH ROW EXECUTE FUNCTION governance.enforce_administration_ceiling();
```

- [ ] **Step 5: Enforce the ceiling when recording**

In `packages/db/src/services/evidence.ts`, at the top of `recordObservation`'s transaction, before the insert:

```ts
    // The administration's effective ceiling binds the claim, and it is
    // enforced here rather than trusted from the caller. Observations with no
    // attempt (adaptive knowledge checks) carry no administration and so no
    // ceiling.
    if (input.attemptId) {
      const ceilingResult = await tx.execute(sql`
        SELECT ta.effective_evidence_ceiling, lor.mastery_level, lo.canonical_code
        FROM assessment.learner_attempt att
        JOIN assessment.task_administration ta ON ta.id = att.task_administration_id
        JOIN catalog.learning_objective_revision lor ON lor.id = ${input.objectiveRevisionId}
        JOIN catalog.learning_objective lo ON lo.id = lor.learning_objective_id
        WHERE att.id = ${input.attemptId}
      `);
      const row = ceilingResult.rows[0];
      if (row && Number(row.mastery_level) > Number(row.effective_evidence_ceiling)) {
        throw new Error(
          `administration effective ceiling L${row.effective_evidence_ceiling} cannot establish ${row.canonical_code} (L${row.mastery_level})`,
        );
      }
    }
```

- [ ] **Step 6: Update the seed**

In `packages/db/src/seed/data/tasks.ts`: rename `TaskSeed.evidenceCeiling` to `designEvidenceCeiling`, add `effectiveEvidenceCeiling: 1 | 2 | 3 | 4 | 5` to the administration seed type, set the `practice` administration to `effectiveEvidenceCeiling: 2` (it permits hints and an AI tutor) and the `qualification` administration to `effectiveEvidenceCeiling: 3`. Delete the now-redundant `evidenceCeilingReduced: true` from the practice `assistancePolicy`.

In `packages/db/src/services/assessment.ts`, update the ceiling validation message and column name, and write `effectiveEvidenceCeiling` on the administration insert.

- [ ] **Step 7: Generate, verify, commit**

Run: `pnpm --filter @lighthouse/db db:generate && pnpm db:reset && pnpm --filter @lighthouse/db test && pnpm lint && pnpm check-types`
Expected: all green, ceiling test passes.

```bash
git add packages/db
git commit -m "feat: move the effective evidence ceiling to the task administration"
```

---

## Task 10: Assurance split and typed claim constraints

**Files:**
- Modify: `packages/db/src/schema/catalog.ts`, `packages/db/src/schema/qualification.ts`
- Modify: `packages/db/src/services/catalog.ts`, `packages/db/src/services/assessment.ts`, `packages/db/src/services/publication.ts`, `packages/db/src/services/role-compiler.ts`
- Modify: `packages/db/src/seed/data/objectives.ts`, `packages/db/src/seed/data/roles.ts`

**Interfaces:**
- Produces:
  - `learningObjectiveRevision.defaultAssuranceClass` (renamed from `assuranceClass`)
  - `catalog.objective_claim_evidence_constraint` table
  - `objectiveRequirement.requiredAssuranceClass` (NOT NULL)
  - `ObjectiveInput.defaultAssuranceClass`, `ObjectiveInput.claimEvidenceConstraints`
  - `ObjectivePolicy.requiredAssuranceClass?: "A" | "B" | "C"`

- [ ] **Step 1: Rename the objective column**

In `packages/db/src/schema/catalog.ts`, rename `assuranceClass` to
`defaultAssuranceClass: char("default_assurance_class", { length: 1 }).notNull()` with check name `ck_objective_default_assurance_class`. Add the comment:

```ts
    // Advisory. It seeds the initial value when authoring a role requirement
    // and governs nothing on its own — how much proof a qualification demands
    // lives on qualification.objective_requirement.required_assurance_class.
    // A = Lightweight, B = Performance, C = High Assurance.
```

- [ ] **Step 2: Add the typed claim constraints**

In `packages/db/src/schema/catalog.ts`, after `objectiveCriterion`, add:

```ts
// Typed, not jsonb: these drive publication validation, which makes them core
// governing semantics rather than flexible metadata. They follow from the
// CLAIM — an `implement` objective inherently requires practical performance
// regardless of who is hiring.
export const objectiveClaimEvidenceConstraint = catalogSchema.table(
  "objective_claim_evidence_constraint",
  {
    objectiveRevisionId: uuid("objective_revision_id")
      .primaryKey()
      .references(() => learningObjectiveRevision.id),
    practicalPerformanceRequired: boolean("practical_performance_required").notNull(),
    constructedResponseSupported: boolean("constructed_response_supported").notNull(),
    multipleChoiceAloneSufficient: boolean("multiple_choice_alone_sufficient").notNull(),
    directObservationPossible: boolean("direct_observation_possible").notNull(),
  },
  () => [
    check(
      "ck_claim_constraint_coherent",
      sql`NOT (practical_performance_required AND multiple_choice_alone_sufficient)`,
    ),
  ],
);
```

- [ ] **Step 3: Add governing assurance to the requirement**

In `packages/db/src/schema/qualification.ts`, add to `objectiveRequirement`:

```ts
    // Governing and frozen. Compiled to an explicit value at role publication —
    // never inherited dynamically from the objective afterwards, because the
    // frozen revision must state what it actually required.
    requiredAssuranceClass: char("required_assurance_class", { length: 1 }).notNull(),
```

with `check("ck_objective_requirement_assurance", sql\`required_assurance_class IN ('A','B','C')\`)`. Import `char`.

- [ ] **Step 4: Update the catalog service**

Rename `ObjectiveInput.assuranceClass` to `defaultAssuranceClass` and add:

```ts
  claimEvidenceConstraints: {
    practicalPerformanceRequired: boolean;
    constructedResponseSupported: boolean;
    multipleChoiceAloneSufficient: boolean;
    directObservationPossible: boolean;
  };
```

In `createObjective`'s transaction, after the criteria loop, insert the constraint row from `input.claimEvidenceConstraints`.

- [ ] **Step 5: Compile assurance in the role compiler**

In `packages/db/src/services/role-compiler.ts`, add `requiredAssuranceClass?: "A" | "B" | "C";` to `ObjectivePolicy`, add `masteryLevel` is already on `ResolvedObjective`; also carry `defaultAssuranceClass` on it by adding `lor.default_assurance_class` to both `resolveObjective` and `collectSetObjectives` queries and to the `ResolvedObjective` interface.

In the `fullPolicy` construction add:

```ts
        requiredAssuranceClass:
          policy.requiredAssuranceClass ?? (objective.defaultAssuranceClass as "A" | "B" | "C"),
```

and write it on the `objectiveRequirement` insert. It is part of `fullPolicy`, so it automatically enters the compiled hash.

Also compile requirement contexts. Add to `ObjectivePolicy`:

```ts
  contexts?: Array<{
    dimensionCode: string;
    valueCode?: string;
    minimumDistinctValues?: number;
  }>;
```

After inserting each `objectiveRequirement` (capture its id with `.returning({ id: s.objectiveRequirement.id })`), insert its contexts, validating the required-dimensions-only rule:

```ts
      for (const context of policy.contexts ?? []) {
        const policyRow = await this.db.execute(sql`
          SELECT policy FROM catalog.objective_context_policy
          WHERE objective_revision_id = ${objective.objectiveRevisionId}
            AND dimension_code = ${context.dimensionCode}
        `);
        if (policyRow.rows[0]?.policy !== "required") {
          throw new Error(
            `role requirement pins ${context.dimensionCode} on ${objective.canonicalCode}, but the objective does not declare it required`,
          );
        }
        // Allowed values inherit downward: permitting aws permits aws_govcloud.
        if (context.valueCode) {
          const permitted = await this.db.execute(sql`
            WITH RECURSIVE allowed AS (
              SELECT cv.id
              FROM catalog.objective_context_allowed_value acv
              JOIN catalog.context_value cv ON cv.id = acv.context_value_id
              WHERE acv.objective_revision_id = ${objective.objectiveRevisionId}
                AND acv.dimension_code = ${context.dimensionCode}
              UNION ALL
              SELECT child.id FROM catalog.context_value child
              JOIN allowed ON child.parent_value_id = allowed.id
            )
            SELECT
              (SELECT count(*) FROM catalog.objective_context_allowed_value
               WHERE objective_revision_id = ${objective.objectiveRevisionId}
                 AND dimension_code = ${context.dimensionCode}) AS whitelist_size,
              (SELECT count(*) FROM allowed a
               JOIN catalog.context_value cv ON cv.id = a.id
               WHERE cv.code = ${context.valueCode}) AS permitted
          `);
          const row = permitted.rows[0];
          if (Number(row?.whitelist_size ?? 0) > 0 && Number(row?.permitted ?? 0) === 0) {
            throw new Error(
              `role requirement pins ${context.dimensionCode}=${context.valueCode} on ${objective.canonicalCode}, which the objective's allowed-value whitelist does not permit`,
            );
          }
        }

        // A breadth demand cannot exceed the values the dimension actually has.
        const minimumDistinctValues = context.minimumDistinctValues ?? 1;
        if (minimumDistinctValues > 1) {
          const available = await this.db.execute(sql`
            SELECT count(*) AS n FROM catalog.context_value
            WHERE dimension_code = ${context.dimensionCode}
          `);
          if (Number(available.rows[0]?.n ?? 0) < minimumDistinctValues) {
            throw new Error(
              `role requirement demands ${minimumDistinctValues} distinct ${context.dimensionCode} values, but the dimension has fewer`,
            );
          }
        }

        await this.db.insert(s.objectiveRequirementContext).values({
          objectiveRequirementId: requirement.id,
          dimensionCode: context.dimensionCode,
          contextValueId: context.valueCode
            ? await findContextValueId(this.db, context.dimensionCode, context.valueCode)
            : null,
          minimumDistinctValues,
        });
      }
```

Add `contexts` to the `nodeRequirements` push so they enter the hash. Import `findContextValueId` from `./context`.

- [ ] **Step 6: Replace the assurance-driven task validation**

In `packages/db/src/services/assessment.ts`, **delete** the Class B/C observable check entirely — criterion coverage in `publication.ts` replaces it, and two overlapping validations that disagree are worse than either alone. Update the ceiling check to read `defaultAssuranceClass`'s replacement only where needed (the query's `lor.assurance_class` select becomes `lor.default_assurance_class`, or drop it if unused).

In `packages/db/src/services/publication.ts`, change the `missingContracts` warning query's `lor.assurance_class` to `lor.default_assurance_class`.

- [ ] **Step 7: Update the seed**

In `objectives.ts`, rename every `assuranceClass:` to `defaultAssuranceClass:` and add `claimEvidenceConstraints` to each objective. Use these defaults by verb:

```
explain / describe  -> { practicalPerformanceRequired: false, constructedResponseSupported: true,
                         multipleChoiceAloneSufficient: false, directObservationPossible: true }
predict / diagnose  -> { practicalPerformanceRequired: false, constructedResponseSupported: true,
                         multipleChoiceAloneSufficient: false, directObservationPossible: true }
implement / build   -> { practicalPerformanceRequired: true,  constructedResponseSupported: false,
                         multipleChoiceAloneSufficient: false, directObservationPossible: true }
evaluate / select   -> { practicalPerformanceRequired: false, constructedResponseSupported: true,
                         multipleChoiceAloneSufficient: false, directObservationPossible: true }
```

Consult `packages/db/src/seed/data/verbs.ts` for the exact verb list and apply the closest row.

- [ ] **Step 8: Generate, verify, commit**

Run: `pnpm --filter @lighthouse/db db:generate && pnpm db:reset && pnpm --filter @lighthouse/db test && pnpm lint && pnpm check-types && pnpm --filter @lighthouse/db db:demo`
Expected: green. **The compiled hash changes** — requirements now carry assurance and context. That is expected, not a regression.

```bash
git add packages/db
git commit -m "feat: split advisory objective assurance from governing requirement assurance"
```

---

## Task 14: Context correctness hardening

**Run this immediately BEFORE Task 11.** Added after the Task 3 review, which found four
correctness gaps that are dormant only because nothing declares a required context
dimension yet. Task 11 is what makes contexts live, so every one of these fires there.

**Files:**
- Modify: `packages/db/src/services/projections.ts`, `packages/db/src/services/role-state.ts`, `packages/db/src/services/assertions.ts`, `packages/db/src/schema/context.ts`, `packages/db/src/schema/evidence.ts`, `packages/db/src/schema/assertions.ts`, `packages/db/src/schema/assessment.ts`

**Interfaces:**
- Produces: `RecalculationDiagnostics { skippedIncompleteContext: number }` returned alongside assertion outcomes.

- [ ] **Step 1: Make the frontier context-aware**

`computeFrontier` assumes one assertion row per `(learner, objective)`. Both the `states`
CTE (`projections.ts:80-83`) and the `ps` LEFT JOIN (`:97-100`) key on
`(learner_id, objective_revision_id)` with no context predicate, so the moment an objective
carries two context-scoped assertions the frontier emits duplicate candidates and multiplies
the `hard_prerequisites` JSON entries.

For frontier purposes an objective counts as reached if ANY context is demonstrated —
the frontier answers "what should I learn next", not "what am I qualified for". Collapse
both to one row per objective by state precedence:

```sql
    states AS (
      SELECT DISTINCT ON (objective_revision_id) objective_revision_id, state
      FROM learner.objective_assertion
      WHERE learner_id = ${learnerId}
      ORDER BY objective_revision_id,
        CASE state
          WHEN 'demonstrated' THEN 0 WHEN 'developing' THEN 1 WHEN 'stale' THEN 2
          WHEN 'contradicted' THEN 3 ELSE 4
        END
    )
```

Apply the same `DISTINCT ON` collapse to the `ps` prerequisite join. Add a test asserting
that an objective with two context-scoped assertions yields exactly one frontier entry.

- [ ] **Step 2: Make the observation scan context-aware**

`role-state.ts` gates the closure only on whether a demonstrated assertion exists in
context; it then evaluates `via`, `minimumIndependence`, `minimumTransfer` and
`maximumEvidenceAge` against `evidence.observation` with NO context filter. So a weak
in-context assertion plus a strong OUT-of-context observation passes the policy gate on
evidence from the wrong context — which defeats context scoping for the quality half of
the check.

Filter the observation scan through the same `pinned` closure: an observation qualifies
only when, for every pinned dimension, it carries an `observation_context` row whose value
is in the closure. Reuse the CTE rather than duplicating the recursion.

- [ ] **Step 3: Scope breadth counting to the requirement's other pins**

The `minimumDistinctValues` count runs across all demonstrated assertions for the
objective, so a requirement pinning `cloud_provider=aws` and demanding breadth >= 2 on
`deployment_env` counts `deployment_env` values from assertions that fail the `aws` pin.
Restrict the distinct count to assertions that also satisfy every pinned dimension.

- [ ] **Step 4: Make skipped-for-incomplete-context observations visible**

When an objective newly declares a required dimension, observations lacking it produce no
assertion and the old assertion disappears with no error. **The disappearance is correct** —
spec §1 requires exactly this, since such evidence genuinely cannot establish a scoped
claim — but it must not be silent. Have `recalculateAssertionsForObjective` count the
observations it skipped for incomplete context and return that alongside the outcomes, and
have the demo print it. Do NOT add a backfill or a default-context fallback: inventing a
context for evidence that never carried one is precisely the overclaiming this pass exists
to prevent.

- [ ] **Step 5: Close the dimension/value mismatch**

`objective_assertion_context`, `observation_context` and `task_variant_context` each carry
independent FKs to `context_dimension.code` and `context_value.id`, with nothing forcing
the value to belong to the named dimension. A row claiming dimension `cloud_provider` with
an `azure_region` value id is representable today. Add a unique constraint on
`context_value (id, dimension_code)` and make all three tables use a composite FK to it.

- [ ] **Step 6: Verify and commit**

Run `pnpm --filter @lighthouse/db db:generate && pnpm db:reset && pnpm --filter @lighthouse/db test && pnpm lint && pnpm check-types && pnpm --filter @lighthouse/db db:demo`.
The demo's load-bearing lines must be unchanged.

```bash
git add packages/db
git commit -m "fix: make frontier, evidence scan, and breadth counting context-aware"
```

---

## Task 11: Cloud seed branch, context policies, and the demo proof

**Depends on:** Task 3. This is the first task that seeds a required context dimension.

**Files:**
- Create: `packages/db/src/seed/data/context.ts`, `packages/db/src/seed/data/cloud.ts`
- Modify: `packages/db/src/seed/index.ts`, `packages/db/src/seed/data/domains.ts`, `packages/db/src/seed/data/competencies.ts`, `packages/db/src/services/catalog.ts`
- Modify: `packages/db/src/demo/scenario.ts`
- Modify: `packages/db/src/test/context.test.ts`

**Interfaces:**
- Produces: `ObjectiveInput.contextPolicies?: Array<{ dimensionCode: string; policy: "required" | "optional" | "not_applicable"; allowedValueCodes?: string[] }>`

- [ ] **Step 1: Write the three failing tests**

Append to `packages/db/src/test/context.test.ts`:

```ts
import { checkObjectiveSatisfaction } from "../services/role-state";

const cloudPolicy = (valueCode: string | null) => ({
  directEvidenceRequired: false,
  proxyEvidenceAllowed: true,
  minimumIndependence: null,
  minimumTransferDistance: null,
  minimumPerformanceScope: null,
  maximumEvidenceAge: null,
  contexts: [{ dimensionCode: "cloud_provider", valueCode, minimumDistinctValues: 1 }],
});

test("GovCloud evidence satisfies an AWS requirement, but not the reverse", async () => {
  const govcloudLearner = await createLearner(db, "ctx-govcloud");
  const target = await objectiveId(db, "CLOUD-DEPLOY-L3-001");

  const observationId = await recordObservation(db, {
    learnerId: govcloudLearner,
    objectiveRevisionId: target,
    result: "successful",
    evidenceStrength: "direct",
    independenceLevel: 4,
    transferDistance: "near",
    performanceScope: "focused",
    contexts: { cloud_provider: "aws_govcloud" },
  });
  await recalculateForObservations(db, [observationId]);

  const asAws = await checkObjectiveSatisfaction(db, govcloudLearner, target, cloudPolicy("aws"));
  expect(asAws.satisfied).toBe(true);

  const awsLearner = await createLearner(db, "ctx-aws");
  const awsObservation = await recordObservation(db, {
    learnerId: awsLearner,
    objectiveRevisionId: target,
    result: "successful",
    evidenceStrength: "direct",
    independenceLevel: 4,
    transferDistance: "near",
    performanceScope: "focused",
    contexts: { cloud_provider: "aws" },
  });
  await recalculateForObservations(db, [awsObservation]);

  const asGovcloud = await checkObjectiveSatisfaction(
    db, awsLearner, target, cloudPolicy("aws_govcloud"),
  );
  expect(asGovcloud.satisfied).toBe(false);

  const asAzure = await checkObjectiveSatisfaction(db, awsLearner, target, cloudPolicy("azure"));
  expect(asAzure.satisfied).toBe(false);
});

test("an observation missing a required dimension cannot produce a demonstrated assertion", async () => {
  const learnerId = await createLearner(db, "ctx-incomplete");
  const target = await objectiveId(db, "CLOUD-DEPLOY-L3-001");

  const observationId = await recordObservation(db, {
    learnerId,
    objectiveRevisionId: target,
    result: "successful",
    evidenceStrength: "direct",
    independenceLevel: 4,
    transferDistance: "near",
    performanceScope: "focused",
    // No cloud_provider, which the objective declares required.
  });
  const outcomes = await recalculateForObservations(db, [observationId]);
  expect(outcomes.get(target) ?? []).toEqual([]);
});
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `pnpm --filter @lighthouse/db test src/test/context.test.ts`
Expected: FAIL — objective `CLOUD-DEPLOY-L3-001` not found.

- [ ] **Step 3: Seed the dimensions and values**

Create `packages/db/src/seed/data/context.ts`:

```ts
import type { ContextDimensionInput, ContextValueInput } from "../../services/context";

export const contextDimensions: ContextDimensionInput[] = [
  {
    code: "cloud_provider",
    name: "Cloud Provider",
    description:
      "Which cloud provider's services and operational model the capability was demonstrated against.",
  },
  {
    code: "programming_language",
    name: "Programming Language",
    description:
      "Which language a portable capability was demonstrated in. Not used on objectives where the language is already intrinsic to the claim.",
  },
];

// Order matters: a parent value must exist before its child references it.
export const contextValues: ContextValueInput[] = [
  { dimensionCode: "cloud_provider", code: "aws", name: "Amazon Web Services" },
  { dimensionCode: "cloud_provider", code: "azure", name: "Microsoft Azure" },
  { dimensionCode: "cloud_provider", code: "gcp", name: "Google Cloud Platform" },
  {
    dimensionCode: "cloud_provider",
    code: "aws_govcloud",
    name: "AWS GovCloud (US)",
    parentCode: "aws",
    description:
      "Parent is aws because evidence gathered in GovCloud is valid evidence for AWS. The reverse does not hold.",
  },
  { dimensionCode: "programming_language", code: "rust", name: "Rust" },
  { dimensionCode: "programming_language", code: "python", name: "Python" },
  { dimensionCode: "programming_language", code: "go", name: "Go" },
];
```

- [ ] **Step 4: Accept context policies on objectives**

In `packages/db/src/services/catalog.ts`, add to `ObjectiveInput`:

```ts
  contextPolicies?: Array<{
    dimensionCode: string;
    policy: "required" | "optional" | "not_applicable";
    /** Whitelist. Allowed values inherit downward: permitting aws permits aws_govcloud. */
    allowedValueCodes?: string[];
  }>;
```

In `createObjective`'s transaction, after the claim-constraint insert:

```ts
      for (const contextPolicy of input.contextPolicies ?? []) {
        await tx.insert(s.objectiveContextPolicy).values({
          objectiveRevisionId: revision.id,
          dimensionCode: contextPolicy.dimensionCode,
          policy: contextPolicy.policy,
        });
        for (const valueCode of contextPolicy.allowedValueCodes ?? []) {
          await tx.execute(sql`
            INSERT INTO catalog.objective_context_allowed_value
              (objective_revision_id, dimension_code, context_value_id)
            SELECT ${revision.id}, ${contextPolicy.dimensionCode}, id
            FROM catalog.context_value
            WHERE dimension_code = ${contextPolicy.dimensionCode} AND code = ${valueCode}
          `);
        }
      }
```

- [ ] **Step 5: Seed the cloud branch**

Create `packages/db/src/seed/data/cloud.ts` with one competency and three objectives under a `cloud-computing` domain. `CLOUD-DEPLOY-L3-001` is the one the tests use:

```ts
import type { ObjectiveInput } from "../../services/catalog";

export const cloudCompetencyCode = "cloud.application-deployment";

export const cloudObjectives: ObjectiveInput[] = [
  {
    code: "CLOUD-DEPLOY-L3-001",
    title: "Deploy and operate a cloud-hosted application",
    statement:
      "Deploy a containerized application to a managed cloud runtime, configure its networking and identity, and verify it serves traffic and recovers from instance loss.",
    masteryLevel: 3,
    verbCode: "implement",
    defaultAssuranceClass: "B",
    performanceObject: "a cloud-hosted application deployment",
    criteria: [
      {
        code: "runtime-provisioned",
        statement: "A managed runtime is provisioned and serves the application",
        kind: "success",
      },
      {
        code: "identity-and-network-configured",
        statement: "Networking and workload identity are configured to least privilege",
        kind: "success",
      },
      {
        code: "recovers-from-instance-loss",
        statement: "The application recovers from the loss of a single instance",
        kind: "success",
      },
      {
        code: "no-public-credentials",
        statement: "Does not expose long-lived credentials in the deployed configuration",
        kind: "critical_error",
      },
    ],
    claimEvidenceConstraints: {
      practicalPerformanceRequired: true,
      constructedResponseSupported: false,
      multipleChoiceAloneSufficient: false,
      directObservationPossible: true,
    },
    // Provider-neutral capability, provider-scoped evidence. This is the whole
    // point: one objective, evidence that knows where it came from.
    contextPolicies: [{ dimensionCode: "cloud_provider", policy: "required" }],
    primaryCompetencyCode: cloudCompetencyCode,
  },
];
```

Add a `cloud-computing` domain entry to `domains.ts` (replacing or alongside the existing cloud/infrastructure entry, keeping the total consistent) and the `cloud.application-deployment` competency to `competencies.ts`.

- [ ] **Step 6: Wire the seed**

In `packages/db/src/seed/index.ts`, after the verbs block and before domains, add:

```ts
    console.log("── Context dimensions");
    const contextService = new ContextService(db);
    for (const dimension of contextDimensions) await contextService.createDimension(dimension);
    for (const value of contextValues) await contextService.createValue(value);
    console.log(`   ${contextDimensions.length} dimensions, ${contextValues.length} values`);
```

and append `cloudObjectives` to the objectives loop.

- [ ] **Step 7: Add the demo context section**

In `packages/db/src/demo/scenario.ts`, before the frontier recap, add a section that records AWS evidence and GovCloud evidence for `CLOUD-DEPLOY-L3-001` on two throwaway learners and prints the four-row matrix:

```ts
    console.log("\n── §1 Context: where was this capability demonstrated?");
    const cloudObjective = ctx.objective("CLOUD-DEPLOY-L3-001");
    for (const [evidenceValue, expectations] of [
      ["aws", ["aws", "azure", "aws_govcloud"]],
      ["aws_govcloud", ["aws"]],
    ] as const) {
      const [contextLearner] = await db
        .insert(s.profile)
        .values({
          displayName: `Context Demo (${evidenceValue})`,
          externalSubjectId: `context-demo-${evidenceValue}-${Date.now()}`,
        })
        .returning({ id: s.profile.id });
      if (!contextLearner) throw new Error("failed to create context learner");

      const observationId = await recordObservation(db, {
        learnerId: contextLearner.id,
        objectiveRevisionId: cloudObjective,
        result: "successful",
        evidenceStrength: "direct",
        independenceLevel: 4,
        transferDistance: "near",
        performanceScope: "composite",
        contexts: { cloud_provider: evidenceValue },
      });
      await recalculateForObservations(db, [observationId]);

      for (const requirementValue of expectations) {
        const outcome = await checkObjectiveSatisfaction(db, contextLearner.id, cloudObjective, {
          directEvidenceRequired: false,
          proxyEvidenceAllowed: true,
          minimumIndependence: null,
          minimumTransferDistance: null,
          minimumPerformanceScope: null,
          maximumEvidenceAge: null,
          contexts: [
            {
              dimensionCode: "cloud_provider",
              valueCode: requirementValue,
              minimumDistinctValues: 1,
            },
          ],
        });
        console.log(
          `   evidence ${evidenceValue} vs requirement ${requirementValue}: ${outcome.satisfied ? "PASS" : "FAIL"}`,
        );
      }
    }
```

Expected output:

```
   evidence aws vs requirement aws: PASS
   evidence aws vs requirement azure: FAIL
   evidence aws vs requirement aws_govcloud: FAIL
   evidence aws_govcloud vs requirement aws: PASS
```

- [ ] **Step 8: Verify and commit**

Run: `pnpm db:reset && pnpm --filter @lighthouse/db test && pnpm lint && pnpm check-types && pnpm --filter @lighthouse/db db:demo`
Expected: all six smoke tests pass; the demo prints the four-row matrix exactly as above.

```bash
git add packages/db
git commit -m "feat: seed cloud context branch and prove context matching in the demo"
```

---

## Task 12: Immutability surface

**Files:**
- Modify: `packages/db/drizzle/0004_evidence_semantics_governance.sql`
- Create: `packages/db/src/test/immutability.test.ts`

**Do this last among schema tasks** — it freezes rows earlier tasks still need to write.

Because `0004` has already been applied, add these statements in a **new** migration `0006_evidence_semantics_immutability.sql` rather than editing `0004`, and register it in the journal.

- [ ] **Step 1: Write the failing test**

Create `packages/db/src/test/immutability.test.ts`:

```ts
import { sql } from "drizzle-orm";
import { afterAll, expect, test } from "vitest";
import { withDb } from "./helpers";

const { db, pool } = withDb();
afterAll(async () => { await pool.end(); });

test("criteria of a published objective revision are frozen", async () => {
  await expect(
    db.execute(sql`
      UPDATE catalog.objective_criterion c
      SET statement = 'tampered'
      FROM catalog.learning_objective_revision lor
      JOIN catalog.learning_objective lo ON lo.id = lor.learning_objective_id
      WHERE c.objective_revision_id = lor.id AND lo.canonical_code = 'RUST-NET-L3-001'
    `),
  ).rejects.toThrow(/published|frozen|immutable/i);
});

test("a referenced context value's parent cannot be re-pointed", async () => {
  await expect(
    db.execute(sql`
      UPDATE catalog.context_value SET parent_value_id = NULL WHERE code = 'aws_govcloud'
    `),
  ).rejects.toThrow(/referenced|frozen|immutable/i);
});
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `pnpm --filter @lighthouse/db test src/test/immutability.test.ts`
Expected: both FAIL — the updates succeed. **Run `pnpm db:reset` afterwards** to undo the tampering before continuing.

- [ ] **Step 3: Write the immutability migration**

Create `packages/db/drizzle/0006_evidence_semantics_immutability.sql`:

```sql
-- ---------------------------------------------------------------------------
-- Immutability for the child rows this pass introduced (spec §8).
--
-- enforce_objective_revision_immutability freezes the PARENT row of a
-- published objective revision and nothing else. Mutating these children
-- retroactively changes what already-recorded evidence meant.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION governance.enforce_objective_child_immutability()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_revision uuid;
BEGIN
  target_revision := coalesce(NEW.objective_revision_id, OLD.objective_revision_id);

  IF EXISTS (
    SELECT 1
    FROM catalog.framework_release_objective fro
    JOIN catalog.framework_release fr ON fr.id = fro.framework_release_id
    WHERE fro.objective_revision_id = target_revision
      AND fr.status IN ('published', 'retired')
  ) THEN
    RAISE EXCEPTION 'objective revision % is published; its % rows are frozen',
      target_revision, TG_TABLE_NAME;
  END IF;

  RETURN coalesce(NEW, OLD);
END;
$$;
--> statement-breakpoint

CREATE TRIGGER trg_objective_criterion_immutability
BEFORE UPDATE OR DELETE ON catalog.objective_criterion
FOR EACH ROW EXECUTE FUNCTION governance.enforce_objective_child_immutability();
--> statement-breakpoint

CREATE TRIGGER trg_objective_context_policy_immutability
BEFORE UPDATE OR DELETE ON catalog.objective_context_policy
FOR EACH ROW EXECUTE FUNCTION governance.enforce_objective_child_immutability();
--> statement-breakpoint

CREATE TRIGGER trg_objective_context_allowed_value_immutability
BEFORE UPDATE OR DELETE ON catalog.objective_context_allowed_value
FOR EACH ROW EXECUTE FUNCTION governance.enforce_objective_child_immutability();
--> statement-breakpoint

CREATE TRIGGER trg_objective_claim_constraint_immutability
BEFORE UPDATE OR DELETE ON catalog.objective_claim_evidence_constraint
FOR EACH ROW EXECUTE FUNCTION governance.enforce_objective_child_immutability();
--> statement-breakpoint

-- Implication criteria freeze with their implication's release: changing which
-- criteria gate a proxy rule changes the meaning of every proxy observation
-- already derived through it.
CREATE OR REPLACE FUNCTION governance.enforce_implication_criterion_immutability()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM catalog.objective_evidence_implication i
    JOIN catalog.framework_release fr ON fr.id = i.framework_release_id
    WHERE i.id = coalesce(NEW.implication_id, OLD.implication_id)
      AND fr.status IN ('published', 'retired')
  ) THEN
    RAISE EXCEPTION 'implication belongs to a published release; its criteria are frozen';
  END IF;
  RETURN coalesce(NEW, OLD);
END;
$$;
--> statement-breakpoint

CREATE TRIGGER trg_implication_criterion_immutability
BEFORE UPDATE OR DELETE ON catalog.objective_evidence_implication_criterion
FOR EACH ROW EXECUTE FUNCTION governance.enforce_implication_criterion_immutability();
--> statement-breakpoint

-- Criterion mappings and variant contexts freeze once evidence exists under
-- the owning task revision. A task revision has no published state of its
-- own; what makes these load-bearing is recorded attempts.
CREATE OR REPLACE FUNCTION governance.enforce_observable_mapping_immutability()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM assessment.evidence_spec_observable obs
    JOIN assessment.task_objective_evidence_spec spec ON spec.id = obs.evidence_spec_id
    JOIN assessment.task_variant tv ON tv.task_revision_id = spec.task_revision_id
    JOIN assessment.task_administration ta ON ta.task_variant_id = tv.id
    JOIN assessment.learner_attempt att ON att.task_administration_id = ta.id
    WHERE obs.id = coalesce(NEW.evidence_spec_observable_id, OLD.evidence_spec_observable_id)
  ) THEN
    RAISE EXCEPTION 'observable has recorded attempts; its criterion mapping is frozen';
  END IF;
  RETURN coalesce(NEW, OLD);
END;
$$;
--> statement-breakpoint

CREATE TRIGGER trg_observable_criterion_mapping_immutability
BEFORE UPDATE OR DELETE ON assessment.observable_criterion_mapping
FOR EACH ROW EXECUTE FUNCTION governance.enforce_observable_mapping_immutability();
--> statement-breakpoint

CREATE OR REPLACE FUNCTION governance.enforce_variant_context_immutability()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM assessment.task_administration ta
    JOIN assessment.learner_attempt att ON att.task_administration_id = ta.id
    WHERE ta.task_variant_id = coalesce(NEW.task_variant_id, OLD.task_variant_id)
  ) THEN
    RAISE EXCEPTION 'variant has recorded attempts; its context is frozen';
  END IF;
  RETURN coalesce(NEW, OLD);
END;
$$;
--> statement-breakpoint

CREATE TRIGGER trg_task_variant_context_immutability
BEFORE UPDATE OR DELETE ON assessment.task_variant_context
FOR EACH ROW EXECUTE FUNCTION governance.enforce_variant_context_immutability();
--> statement-breakpoint

-- Requirement contexts freeze with their published role level revision.
CREATE OR REPLACE FUNCTION governance.enforce_requirement_context_immutability()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM qualification.objective_requirement oreq
    JOIN qualification.requirement_group g ON g.id = oreq.requirement_group_id
    JOIN qualification.role_level_revision rlr ON rlr.id = g.role_level_revision_id
    WHERE oreq.id = coalesce(NEW.objective_requirement_id, OLD.objective_requirement_id)
      AND rlr.status IN ('published', 'retired')
  ) THEN
    RAISE EXCEPTION 'role level revision is published; its requirement contexts are frozen';
  END IF;
  RETURN coalesce(NEW, OLD);
END;
$$;
--> statement-breakpoint

CREATE TRIGGER trg_requirement_context_immutability
BEFORE UPDATE OR DELETE ON qualification.objective_requirement_context
FOR EACH ROW EXECUTE FUNCTION governance.enforce_requirement_context_immutability();
--> statement-breakpoint

-- Context values carry evidence semantics: context_key stores value CODES and
-- qualification walks the parent chain. Re-parenting aws_govcloud after
-- qualifications have been evaluated would retroactively alter which evidence
-- satisfies which requirement. name/description/active stay mutable.
CREATE OR REPLACE FUNCTION governance.enforce_context_value_semantics_immutability()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.dimension_code IS NOT DISTINCT FROM OLD.dimension_code
     AND NEW.code IS NOT DISTINCT FROM OLD.code
     AND NEW.parent_value_id IS NOT DISTINCT FROM OLD.parent_value_id THEN
    RETURN NEW;
  END IF;

  IF EXISTS (SELECT 1 FROM evidence.observation_context WHERE context_value_id = OLD.id)
     OR EXISTS (SELECT 1 FROM learner.objective_assertion_context WHERE context_value_id = OLD.id)
     OR EXISTS (SELECT 1 FROM qualification.objective_requirement_context WHERE context_value_id = OLD.id)
     OR EXISTS (SELECT 1 FROM assessment.task_variant_context WHERE context_value_id = OLD.id)
     OR EXISTS (SELECT 1 FROM catalog.objective_context_allowed_value WHERE context_value_id = OLD.id)
  THEN
    RAISE EXCEPTION 'context value % is referenced; dimension, code, and parent are frozen', OLD.code;
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER trg_context_value_semantics_immutability
BEFORE UPDATE ON catalog.context_value
FOR EACH ROW EXECUTE FUNCTION governance.enforce_context_value_semantics_immutability();
```

- [ ] **Step 4: Register it in the journal**

Append an `idx: 6` entry with tag `0006_evidence_semantics_immutability` to `packages/db/drizzle/meta/_journal.json`.

- [ ] **Step 5: Verify**

Run: `pnpm db:reset && pnpm --filter @lighthouse/db test`
Expected: the two immutability tests pass; every earlier test still passes — the seed writes all of these rows *before* publication, so nothing is frozen prematurely.

- [ ] **Step 6: Commit**

```bash
git add packages/db
git commit -m "feat: freeze criterion mappings, contexts, and context value semantics"
```

---

## Task 13: Final verification and documentation of the diff

**Files:**
- Modify: `docs/superpowers/specs/2026-08-28-evidence-semantics-design.md` (status line only)

- [ ] **Step 1: Full clean run**

```bash
pnpm db:reset && pnpm --filter @lighthouse/db test && pnpm lint && pnpm check-types
```
Expected: all green. Eight tests across four files.

- [ ] **Step 2: Diff the demo against the baseline**

```bash
pnpm --filter @lighthouse/db db:demo > /tmp/demo-after.txt
diff /tmp/demo-baseline.txt /tmp/demo-after.txt
```

The baseline lives in the session scratchpad; if lost, regenerate it from `git stash` on the pre-change tree.

**Allowed differences, and only these:**
1. The compiled hash. Note it changes on EVERY reseed regardless of this pass: `role-compiler.ts` feeds `objectiveRevisionId` (a random UUID) into `hashCompiledTree`, so the "hash" is a per-database identifier, not a content hash. Pre-existing defect, deferred to the integrity pass. Do not treat a differing hash as evidence of anything.
2. `gated by observables:` becomes `gated by criteria:` with criterion codes.
3. The new `§1 Context` section with its four-row PASS/FAIL matrix.
4. Frontier counts shift by the number of new cloud objectives.

**Any other change is a regression.** In particular these must be byte-identical:
- `1 proxy observation(s) created`
- `RUST-NET-L3-001: demonstrated (confidence 0.95)`
- `RUST-NET-L2-003: demonstrated (confidence 0.85)`
- `RUST-NET-L2-003 with direct required: satisfied=false`

- [ ] **Step 3: Mark the spec implemented**

Change the spec's `Status:` line to `implemented 2026-08-28`.

- [ ] **Step 4: Commit**

```bash
git add docs
git commit -m "docs: mark the evidence semantics spec implemented"
```

---

## Known gaps left open on purpose

- `learner_role_state.readiness_score` is still flat met/total and still misleading for `any_of` groups. Deferred with the structural-readiness work.
- `requirement_group` and `objective_requirement` still lack child-row immutability beneath a published role revision — a pre-existing hole that belongs to the integrity pass because it interacts with making role compilation atomic.
- README and ARCHITECTURE.md remain out of date.
