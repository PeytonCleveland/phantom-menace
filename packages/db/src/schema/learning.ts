import { sql } from "drizzle-orm";
import {
  check,
  integer,
  jsonb,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { learningObjectiveRevision } from "./catalog";
import { learningSchema } from "./enums";

// ---------------------------------------------------------------------------
// Learning assets (§12.13)
// ---------------------------------------------------------------------------

export const asset = learningSchema.table("asset", {
  id: uuid("id").primaryKey().defaultRandom(),
  canonicalCode: text("canonical_code").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const assetRevision = learningSchema.table(
  "asset_revision",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    assetId: uuid("asset_id")
      .notNull()
      .references(() => asset.id),
    revisionNo: integer("revision_no").notNull(),
    title: text("title").notNull(),
    assetType: text("asset_type").notNull(),
    sourceUri: text("source_uri"),
    estimatedMinutes: integer("estimated_minutes"),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("uq_asset_revision_no").on(t.assetId, t.revisionNo),
    check("ck_asset_revision_no_positive", sql`revision_no > 0`),
    check(
      "ck_asset_type",
      sql`asset_type IN ('article', 'video', 'worked_example', 'interactive', 'documentation', 'reference', 'tutorial')`,
    ),
    check("ck_asset_estimated_minutes", sql`estimated_minutes IS NULL OR estimated_minutes >= 0`),
  ],
);

export const assetFragment = learningSchema.table(
  "asset_fragment",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    assetRevisionId: uuid("asset_revision_id")
      .notNull()
      .references(() => assetRevision.id),
    fragmentOrder: integer("fragment_order").notNull(),
    title: text("title"),
    body: text("body"),
    sourceLocator: jsonb("source_locator").notNull().default(sql`'{}'::jsonb`),
  },
  (t) => [unique("uq_asset_fragment_order").on(t.assetRevisionId, t.fragmentOrder)],
);

export const assetObjectiveAlignment = learningSchema.table(
  "asset_objective_alignment",
  {
    assetFragmentId: uuid("asset_fragment_id")
      .notNull()
      .references(() => assetFragment.id),
    objectiveRevisionId: uuid("objective_revision_id")
      .notNull()
      .references(() => learningObjectiveRevision.id),
    purpose: text("purpose").notNull(),
    coverage: text("coverage").notNull(),
    instructionalStrategy: text("instructional_strategy"),
  },
  (t) => [
    primaryKey({ columns: [t.assetFragmentId, t.objectiveRevisionId, t.purpose] }),
    check("ck_alignment_purpose", sql`purpose IN ('teaches', 'practices', 'prepares_for')`),
    check(
      "ck_alignment_coverage",
      sql`coverage IN ('introductory', 'substantial', 'comprehensive')`,
    ),
  ],
);
