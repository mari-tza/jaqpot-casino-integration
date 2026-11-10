import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Load .env locally; CI provides the variables directly.
    setupFiles: ["dotenv/config"],
    // Test files share one database, so run them one at a time.
    fileParallelism: false,
    testTimeout: 30_000,
  },
});
