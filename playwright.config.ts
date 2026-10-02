import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    actionTimeout: 10_000,
    baseURL: "http://127.0.0.1:3310",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "node scripts/readiness/serve.mjs",
    url: "http://127.0.0.1:3310/health",
    timeout: 240_000,
    reuseExistingServer: process.env.READINESS_REUSE_LOCAL === "1",
    gracefulShutdown: { signal: "SIGTERM", timeout: 30_000 },
  },
});
