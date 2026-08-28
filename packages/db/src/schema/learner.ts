import { sql } from "drizzle-orm";
import { jsonb, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { learnerSchema } from "./enums";

// ---------------------------------------------------------------------------
// Learner profile (§12.16)
// Learner assertions live in ./assertions.ts because they reference
// evidence.observation, which itself references this table.
// ---------------------------------------------------------------------------

export const profile = learnerSchema.table("profile", {
  id: uuid("id").primaryKey().defaultRandom(),
  externalSubjectId: text("external_subject_id").unique(),
  displayName: text("display_name").notNull(),
  metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
