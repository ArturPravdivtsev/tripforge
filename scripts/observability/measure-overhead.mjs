import { spawn } from "node:child_process";
import { performance } from "node:perf_hooks";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const apiDirectory = resolve(root, "apps/api");

const disabled = await runScenario(false, 4401);
const enabled = await runScenario(true, 4402);
const deltaPercent = ((enabled.meanMs - disabled.meanMs) / disabled.meanMs) * 100;

process.stdout.write(
  `${JSON.stringify({
    note: "Local sequential /health microbenchmark; not a production claim",
    otelDisabledMeanMs: round(disabled.meanMs),
    otelEnabledMeanMs: round(enabled.meanMs),
    relativeDeltaPercent: round(deltaPercent),
    requests: disabled.requests,
  })}\n`,
);

async function runScenario(enabled, port) {
  const child = spawn(process.execPath, ["dist/main.js"], {
    cwd: apiDirectory,
    env: {
      ...process.env,
      LOG_LEVEL: "fatal",
      NODE_ENV: "development",
      OTEL_ENABLED: String(enabled),
      OTEL_EXPORTER_OTLP_ENDPOINT: "http://127.0.0.1:49999",
      OTEL_EXPORT_TIMEOUT_MS: "500",
      OTEL_METRIC_EXPORT_INTERVAL_MS: "60000",
      OTEL_TRACES_SAMPLER: "parentbased_traceidratio",
      OTEL_TRACES_SAMPLER_ARG: "1",
      PORT: String(port),
      REDIS_URL: "redis://127.0.0.1:49998",
      WEB_ORIGIN: "http://127.0.0.1:3000",
    },
    stdio: "ignore",
  });
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    await waitForHealth(baseUrl, child);
    for (let index = 0; index < 20; index += 1) {
      await fetch(`${baseUrl}/health`);
    }
    const requests = 200;
    const startedAt = performance.now();
    for (let index = 0; index < requests; index += 1) {
      const response = await fetch(`${baseUrl}/health`);
      if (!response.ok) throw new Error("Health request failed");
    }
    return { meanMs: (performance.now() - startedAt) / requests, requests };
  } finally {
    child.kill("SIGTERM");
    await Promise.race([
      new Promise((resolveExit) => child.once("exit", resolveExit)),
      new Promise((resolveTimeout) => setTimeout(resolveTimeout, 4_000)),
    ]);
    if (child.exitCode === null) child.kill("SIGKILL");
  }
}

async function waitForHealth(baseUrl, child) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error("API exited before readiness");
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) return;
    } catch {
      // Startup is still in progress.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error("API did not become ready");
}

function round(value) {
  return Number(value.toFixed(3));
}
