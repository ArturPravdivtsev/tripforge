import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { cpus, totalmem } from "node:os";
import { fork } from "node:child_process";
import { resultsDir, root, run, startStack, waitFor } from "./stack.mjs";
import { request, seedLoad } from "./fixture.mjs";
import { assertProfile } from "./safety.mjs";

export async function runLoad(stack, modes, signal) {
  const binary = process.env.K6_BINARY || "k6";
  const fixture = await seedLoad(stack, 20);
  const first = fixture.sessions[0];
  for (const path of ["/api/trips?pageSize=20", `/api/trips/${first.tripId}`, ...["days", "itinerary-items", "reservations", "expenses", "documents", "search?q=Museum&limit=10", "expenses/balances"].map((suffix) => `/api/trips/${first.tripId}/${suffix}`), "/api/notifications?limit=20"]) await request(stack.apiOrigin, first, path);
  const fixturePath = join(resultsDir, "load-fixture.json");
  await writeFile(fixturePath, JSON.stringify(fixture), { mode: 0o600 });
  const loginTimes = [];
  for (let index = 0; index < 10; index++) {
    const started = performance.now();
    const response = await fetch(`${stack.apiOrigin}/api/auth/login`, { method: "POST", headers: { Origin: stack.webOrigin, "X-TripForge-Request": "1", "Content-Type": "application/json" }, body: JSON.stringify({ email: first.email, password: "Stage31 isolated qualification password" }), signal: AbortSignal.timeout(12_000) });
    if (!response.ok) throw new Error(`Separate login benchmark failed: ${response.status}`);
    loginTimes.push(performance.now() - started);
    const cookie = response.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ");
    await request(stack.apiOrigin, { cookie }, "/api/auth/logout", "POST", {});
  }
  loginTimes.sort((a, b) => a - b);
  const loginBenchmark = { samples: 10, sequential: true, includesArgon2: true, medianMs: loginTimes[5], p95Ms: loginTimes[9], maxMs: loginTimes[9], meanMs: loginTimes.reduce((sum, value) => sum + value, 0) / 10 };
  const reports = [];
  for (const mode of modes) {
    assertProfile(mode, process.env.LOAD_DURATION, process.env.LOAD_VUS);
    const summary = join(resultsDir, `k6-${mode}.json`);
    await writeFile(summary, JSON.stringify({ incomplete: true }));
    const started = Date.now();
    const startedAt = new Date(started).toISOString();
    let passed = true;
    let socketChild;
    let socketCompleted;
    try {
      if (mode === "soak") {
        const duration = process.env.LOAD_DURATION ?? "30m";
        const seconds = Number(duration.slice(0, -1)) * ({ s: 1, m: 60, h: 3600 })[duration.at(-1)];
        socketChild = fork(join(root, "scripts/readiness/socket-soak.mjs"), [], { env: { ...process.env, REALTIME_SOAK_SECONDS: String(seconds) }, stdio: ["ignore", "inherit", "inherit", "ipc"] });
        socketCompleted = new Promise((done) => { socketChild.once("exit", done); socketChild.once("error", () => done(-1)); });
        await new Promise((done, reject) => {
          const timer = setTimeout(() => reject(new Error("Socket companion startup timeout")), 60_000);
          socketChild.once("message", (message) => { clearTimeout(timer); message.type === "socket-soak-ready" ? done() : reject(new Error("Unexpected socket companion message")); });
          socketChild.once("exit", () => { clearTimeout(timer); reject(new Error("Socket companion exited during startup")); });
        });
      }
      console.log(`k6 ${mode} started`);
      await run(binary, ["run", "--quiet", join(root, "performance/k6/core.js")], { signal, env: { ...process.env, MODE: mode, API_ORIGIN: stack.apiOrigin, DISPOSABLE_LOCAL: "1", FIXTURE: fixturePath, SUMMARY: summary,
        ...(process.env.LOAD_DURATION ? { DURATION: process.env.LOAD_DURATION } : {}), ...(process.env.LOAD_VUS ? { VUS: process.env.LOAD_VUS } : {}) } });
      if (socketCompleted && (await socketCompleted) !== 0) passed = false;
    } catch { passed = false; }
    finally {
      if (socketChild && socketChild.exitCode === null && !socketChild.signalCode) socketChild.kill("SIGTERM");
      if (socketCompleted) await socketCompleted;
    }
    let measured;
    try { measured = JSON.parse(await readFile(summary, "utf8")); } catch { measured = { incomplete: true }; passed = false; }
    if (measured.incomplete) passed = false;
    reports.push({ mode, startedAt, endedAt: new Date().toISOString(), passed, interrupted: signal?.aborted ?? false, elapsedSeconds: (Date.now() - started) / 1000, summary: measured });
    console.log(`k6 ${mode}: ${passed ? "PASS" : "FAIL"}`);
    if (!passed) break;
  }
  let idleRecovery;
  if (reports.every(({ passed }) => passed) && !signal?.aborted) {
    const idleStarted = Date.now();
    const lastRuntime = () => stack.samples.findLast((sample) => sample.type === "runtime" && sample.replica === 4410);
    try {
      // Verify normal pool idle eviction BEFORE shutdown; pool.end is not leak proof.
      await waitFor(() => lastRuntime()?.poolTotal === 0 && lastRuntime()?.poolWaiting === 0, "business pool returns to idle after load", 50_000);
      const sample = lastRuntime();
      idleRecovery = { passed: true, elapsedMs: Date.now() - idleStarted, poolTotal: sample.poolTotal, poolIdle: sample.poolIdle, poolWaiting: sample.poolWaiting };
      console.log("PASS post-load pool idle recovery: zero connections/waiters before shutdown");
    } catch {
      idleRecovery = { passed: false, elapsedMs: Date.now() - idleStarted, error: "Business pool did not return to zero connections/waiters within 50s" };
      reports.at(-1).passed = false;
    }
  }
  await writeFile(join(resultsDir, "capacity.json"), JSON.stringify({ measuredAt: new Date().toISOString(), hardware: { platform: process.platform, architecture: process.arch, cpus: cpus().length, cpu: cpus()[0]?.model, hostMemoryBytes: totalmem(), node: process.version }, dataset: fixture.dataset, loginBenchmark, reports, idleRecovery }, null, 2));
  return reports;
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const modes = process.argv.slice(2).length ? process.argv.slice(2) : ["smoke", "load"];
  for (const mode of modes) assertProfile(mode, process.env.LOAD_DURATION, process.env.LOAD_VUS);
  const controller = new AbortController();
  for (const name of ["SIGINT", "SIGTERM"]) process.once(name, () => controller.abort());
  const stack = await startStack({ web: false, replicas: 1 });
  try {
    const reports = await runLoad(stack, modes, controller.signal);
    if (reports.some(({ passed }) => !passed)) process.exitCode = 1;
  } finally { await stack.close(); }
}
