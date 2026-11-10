import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // .env locally; CI sets the variables.
    setupFiles: ["dotenv/config"],
    // One shared database.
    fileParallelism: false,
    testTimeout: 30_000,
    env: { LOG_LEVEL: "silent" },
  },
});
