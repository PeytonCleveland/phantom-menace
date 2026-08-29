# Migration notes

## Fresh-database-only assumption (evidence semantics pass, 2026-08-28)

Two migrations in the evidence semantics pass are safe **only** because `pnpm db:reset`
always rebuilds the database from empty. They have not been written to be safe against a
populated database, and running them against one will fail or silently destroy data:

- **`0003_evidence_semantics.sql`** restructures `learner.assertion_evidence` with
  `ADD COLUMN "assertion_id" uuid NOT NULL` and no default. Against a table that already
  has rows this fails outright (`NOT NULL` violation on existing rows). It only succeeds
  here because the table is empty at migration time.
- **`0008_administration_evidence_ceiling.sql`** renames `evidence_ceiling` to
  `design_evidence_ceiling` on `assessment.task_revision` as a `DROP COLUMN` /
  `ADD COLUMN` pair rather than `RENAME COLUMN`. This is because drizzle-kit's interactive
  "did you rename this column?" prompt cannot be answered non-interactively when generating
  migrations in this pipeline. Against a populated table this drops the column's data
  outright — there is no rename, no backfill, no migration path.

Do not run these migrations against a database that holds real data. If this schema ever
needs to ship to an environment that isn't rebuilt from scratch, both migrations need to be
rewritten (a backfill step for `0003`, an actual `RENAME COLUMN` for `0008`) before that can
happen.

## Migration traps hit during this pass

A few non-obvious drizzle-kit / Postgres behaviors cost real time during this pass. Recorded
here so the next person doesn't rediscover them:

- **Drizzle-kit mis-splits raw SQL containing a literal `;`, even inside quotes.** A
  hand-written `CHECK` constraint using a regex with a literal semicolon (e.g. disallowing
  `;` in an identifier) got corrupted in the emitted `.sql` file when the semicolon split the
  statement in the wrong place — even though the snapshot JSON was generated correctly.
  Work around it by hex-escaping the character (`\x3B` instead of `;`) inside the SQL string.
- **Postgres truncates identifiers at 63 bytes.** Drizzle's auto-generated constraint/index
  names can collide after truncation for tables with long names — this happened for
  `objective_evidence_implication_criterion`. Give explicit, short names to constraints on
  long table names rather than relying on the generated ones.
- **A hand-written migration that changes schema shape must still have a snapshot file
  under `meta/`.** Otherwise the next `db:generate` run believes those shape changes are
  still pending and tries to emit a duplicate migration. Trigger-only migrations (which
  don't change any table/column shape) correctly have no snapshot — see `0004`, `0009`, and
  `0012`.
- **drizzle-kit's interactive prompts (e.g. "did you rename this column?") require a TTY.**
  Drive them non-interactively with `expect` or `script` when generating migrations from a
  script or CI.
- **Mutation-testing a trigger requires applying its revert via `docker exec ... psql`
  directly.** Any `pnpm --filter @lighthouse/db test` invocation re-runs the global setup,
  which re-applies all committed migrations — including the one you just reverted — before
  your test body runs, silently undoing the revert.
