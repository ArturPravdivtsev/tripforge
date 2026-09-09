import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    fileParallelism: false,
    hookTimeout: 120_000,
    include: ["test/**/*.integration-spec.ts"],
    testTimeout: 30_000,
  },
});
