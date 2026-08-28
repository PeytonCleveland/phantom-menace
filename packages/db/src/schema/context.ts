import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
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
