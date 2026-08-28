import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://lighthouse:lighthouse@localhost:5432/lighthouse",
  },
  schemaFilter: [
    "catalog",
    "learning",
    "assessment",
    "evidence",
    "learner",
    "qualification",
    "projection",
    "auth",
  ],
  strict: true,
  verbose: true,
});
