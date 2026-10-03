// Test-only bootstrap of the compiled application. Never copied into runtime images.
import { createRequire } from "node:module";
import { join } from "node:path";
import { monitorEventLoopDelay, PerformanceObserver } from "node:perf_hooks";

const require = createRequire(join(process.env.READINESS_API_DIR, "package.json"));
require(join(process.env.READINESS_API_DIR, "dist/observability/register-api.js"));
const { Test } = require("@nestjs/testing");
const { ConfigService } = require("@nestjs/config");
const { AppModule } = require(join(process.env.READINESS_API_DIR, "dist/app.module.js"));
const { configureApplication } = require(join(process.env.READINESS_API_DIR, "dist/common/configure-application.js"));
const { AI_MODEL_CLIENT } = require(join(process.env.READINESS_API_DIR, "dist/ai/ai.constants.js"));
const { TripForgeIoAdapter } = require(join(process.env.READINESS_API_DIR, "dist/realtime/tripforge-io.adapter.js"));
const { OpenRouteServiceClient, RoutingProviderError } = require(join(process.env.READINESS_API_DIR, "dist/routing/openrouteservice.client.js"));
const { AppLogger } = require(join(process.env.READINESS_API_DIR, "dist/observability/app-logger.service.js"));
const { ObservabilityMetrics } = require(join(process.env.READINESS_API_DIR, "dist/observability/metrics.service.js"));
const { DATABASE_POOL } = require(join(process.env.READINESS_API_DIR, "dist/database/database.constants.js"));
const usage = { inputTokens: 10, cachedInputTokens: 0, outputTokens: 10, reasoningTokens: 0 };
const completed = (output = []) => ({ type: "completed", model: "deterministic-stage31", output, usage });
const call = (name, args) => ({ type: "function_call", name, arguments: JSON.stringify(args), call_id: `stage31-${name}`, id: `call-${name}`, status: "completed" });

const model = {
  available: true,
  async moderate(input) { if (input.includes("provider outage")) throw new Error("Test provider unavailable"); return false; },
  async *generate(input, _tools, signal) {
    const message = [...input].reverse().find((item) => item.role === "user")?.content ?? "";
    const outputs = input.filter((item) => item.type === "function_call_output");
    const drafted = outputs.some((item) => JSON.parse(item.output).proposalDrafted);
    if (message.includes("suggest") && !drafted) {
      const days = outputs.map((item) => JSON.parse(item.output)).find((item) => Array.isArray(item.value) && item.value[0]?.date);
      yield completed(days ? [call("propose_itinerary_create", { dayId: days.value[0].id, kind: "activity", title: process.env.PORTFOLIO_FIXTURE === "1" ? "A quiet walk through Nezu Shrine" : "Browser AI suggestion", startTime: "09:00", endTime: "10:00", notes: null })]
        : [call("get_trip_days", { startDate: null, endDate: null, limit: 14 })]);
      return;
    }
    const chunks = message.includes("slow") ? Array(100).fill("Planning… ") : process.env.PORTFOLIO_FIXTURE === "1"
      ? ["Your first Tokyo day has room for a quiet walking stop. ", "I prepared an activity proposal for review. ", "Nothing has been changed; choose Apply only if it fits your plan. Opening hours are not verified."]
      : ["Grounded ", "browser ", "response."];
    for (const delta of chunks) {
      if (signal.aborted) throw new Error("Stopped");
      await new Promise((done) => setTimeout(done, message.includes("slow") ? 100 : 80));
      yield { type: "text", delta };
    }
    yield completed();
  },
};
const module = await Test.createTestingModule({ imports: [AppModule] })
  .overrideProvider(AI_MODEL_CLIENT).useValue(model)
  .overrideProvider(OpenRouteServiceClient).useValue({ calculate: async () => { throw new RoutingProviderError("unavailable"); } })
  .compile();
const app = module.createNestApplication({ bufferLogs: true });
app.useLogger(app.get(AppLogger));
app.enableShutdownHooks(["SIGTERM", "SIGINT"]);
configureApplication(app);
app.useWebSocketAdapter(new TripForgeIoAdapter(app, app.get(ConfigService), app.get(AppLogger), app.get(ObservabilityMetrics)));
await app.listen(Number(process.env.PORT), "127.0.0.1");
const pool = app.get(DATABASE_POOL);
process.on("message", (message) => {
  if (message?.type === "pool-pressure") {
    void Promise.all(Array.from({ length: 60 }, () => pool.query("SELECT pg_sleep(0.25)")))
      .then(() => process.send?.({ type: "pool-pressure-done", waiting: pool.waitingCount }));
  }
});
const delay = monitorEventLoopDelay({ resolution: 20 });
delay.enable();
let lastCpu = process.cpuUsage();
let lastTime = performance.now();
let gcCount = 0;
let gcDurationMs = 0;
new PerformanceObserver((entries) => {
  for (const entry of entries.getEntries()) { gcCount++; gcDurationMs += entry.duration; }
}).observe({ entryTypes: ["gc"] });
setInterval(() => {
  const cpu = process.cpuUsage();
  const now = performance.now();
  const cpuPercentOneCore = ((cpu.user - lastCpu.user) + (cpu.system - lastCpu.system)) / ((now - lastTime) * 10);
  lastCpu = cpu; lastTime = now;
  process.send?.({ type: "runtime", cpuPercentOneCore, gcCount, gcDurationMs, requestListeners: app.getHttpServer().listenerCount("request"), rss: process.memoryUsage().rss, heap: process.memoryUsage().heapUsed, poolTotal: pool.totalCount, poolIdle: pool.idleCount, poolWaiting: pool.waitingCount, eventLoopP99Ms: delay.percentile(99) / 1e6 });
  gcCount = 0; gcDurationMs = 0;
  delay.reset();
}, 1_000).unref();
