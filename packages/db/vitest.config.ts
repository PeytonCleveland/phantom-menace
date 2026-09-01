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
