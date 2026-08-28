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

// A code containing `;` or `=` would make a canonical context key ambiguous
// to parse back apart, corrupting assertion identity. Both code columns
// reject those two characters. The semicolon is written as the hex escape
// \x3B (in an E'' extended string) rather than a literal `;` because
// drizzle-kit's migration generator mis-splits raw SQL check text on `;`
// even inside a quoted string literal, corrupting the generated migration.
const CODE_FORMAT_CHECK = sql`code !~ E'[\\x3B=]'`;

export const contextDimension = catalogSchema.table(
  "context_dimension",
  {
    code: text("code").primaryKey(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  () => [check("ck_context_dimension_code_format", CODE_FORMAT_CHECK)],
);

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
    // Lets other tables take a composite FK on (context_value_id, dimension_code)
    // so a row cannot claim dimension X while pointing at a value of dimension Y.
    unique("uq_context_value_id_dimension").on(t.id, t.dimensionCode),
    check("ck_context_value_no_self_parent", sql`parent_value_id IS NULL OR parent_value_id <> id`),
    check("ck_context_value_code_format", CODE_FORMAT_CHECK),
  ],
);
