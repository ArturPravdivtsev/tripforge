import {
  AggregationTemporality,
  InMemoryMetricExporter,
  MeterProvider,
  PeriodicExportingMetricReader,
} from "@opentelemetry/sdk-metrics";
import { afterEach, describe, expect, it } from "vitest";

import { routeTemplate } from "./http-observability.middleware";
import { METRIC_NAMES, TripForgeMetrics } from "./metrics.service";

describe("TripForgeMetrics", () => {
  const providers: MeterProvider[] = [];

  afterEach(async () => {
    await Promise.all(providers.splice(0).map((provider) => provider.shutdown()));
  });

  it("records bounded HTTP, rate-limit, realtime, worker and outbox metrics", async () => {
    const exporter = new InMemoryMetricExporter(
      AggregationTemporality.CUMULATIVE,
    );
    const reader = new PeriodicExportingMetricReader({
      exporter,
      exportIntervalMillis: 60_000,
    });
    const provider = new MeterProvider({ readers: [reader] });
    providers.push(provider);
    const metrics = new TripForgeMetrics(provider.getMeter("test"));

    metrics.httpStart("GET");
    metrics.httpComplete("GET", "/api/trips/:tripId", 200, 0.012);
    metrics.rateLimitRejected("login.account");
    metrics.realtimeSocket(1, "connected");
    metrics.realtimeJoin(1);
    metrics.workerJob("storage.cleanup-object", "failed", 0.1);
    metrics.updateOutbox(3, 901);
    await provider.forceFlush();

    const data = exporter
      .getMetrics()
      .flatMap((resource) => resource.scopeMetrics)
      .flatMap((scope) => scope.metrics);
    const names = data.map((metric) => metric.descriptor.name);
    expect(names).toEqual(
      expect.arrayContaining([
        METRIC_NAMES.httpRequests,
        METRIC_NAMES.httpDuration,
        METRIC_NAMES.rateLimitRejections,
        METRIC_NAMES.realtimeActiveSockets,
        METRIC_NAMES.workerJobs,
        METRIC_NAMES.outboxIncomplete,
        METRIC_NAMES.outboxOldestAge,
      ]),
    );

    const limiter = data.find(
      (metric) => metric.descriptor.name === METRIC_NAMES.rateLimitRejections,
    );
    expect(JSON.stringify(limiter)).toContain("login.account");
    expect(JSON.stringify(limiter)).not.toMatch(/email|userId|requestId|tripId/iu);
  });

  it("returns active gauges to zero and keeps UUID routes in one series", async () => {
    const { exporter, metrics, provider } = createHarness(providers);
    const firstRoute = routeTemplate({
      baseUrl: "/api/trips/10000000-0000-4000-8000-000000000001",
      route: { path: "/expenses" },
    } as never);
    const secondRoute = routeTemplate({
      baseUrl: "/api/trips/20000000-0000-4000-8000-000000000002",
      route: { path: "/expenses" },
    } as never);

    metrics.httpStart("GET");
    metrics.httpComplete("GET", firstRoute, 200, 0.01);
    metrics.httpStart("GET");
    metrics.httpComplete("GET", secondRoute, 500, 0.02);
    metrics.realtimeSocket(1, "connected");
    metrics.realtimeSocket(-1, "disconnected");
    metrics.realtimeJoin(1);
    metrics.realtimeJoin(-1);
    await provider.forceFlush();

    expect(firstRoute).toBe(secondRoute);
    const data = metricData(exporter);
    const requestSeries = metric(data, METRIC_NAMES.httpRequests).dataPoints;
    expect(requestSeries).toHaveLength(2);
    expect(
      JSON.stringify(requestSeries.map((point) => point.attributes)),
    ).not.toMatch(/10000000|20000000/iu);
    expect(pointValue(metric(data, METRIC_NAMES.httpInFlight))).toBe(0);
    expect(pointValue(metric(data, METRIC_NAMES.realtimeActiveSockets))).toBe(0);
    expect(pointValue(metric(data, METRIC_NAMES.realtimeActiveJoins))).toBe(0);
  });

  it("records every worker outcome and controlled pool/outbox gauges", async () => {
    const { exporter, metrics, provider } = createHarness(providers);
    metrics.workerJob("storage.cleanup-object", "succeeded", 0.01);
    metrics.workerJob("storage.cleanup-object", "retried", 0.02);
    metrics.workerJob("storage.cleanup-object", "failed", 0.03);
    metrics.updateOutbox(4, 901);
    metrics.registerPool({ idleCount: 2, totalCount: 5, waitingCount: 1 } as never);
    await provider.forceFlush();

    const data = metricData(exporter);
    const worker = JSON.stringify(metric(data, METRIC_NAMES.workerJobs));
    expect(worker).toMatch(/succeeded/iu);
    expect(worker).toMatch(/retried/iu);
    expect(worker).toMatch(/failed/iu);
    expect(pointValue(metric(data, METRIC_NAMES.outboxIncomplete))).toBe(4);
    expect(pointValue(metric(data, METRIC_NAMES.outboxOldestAge))).toBe(901);
    expect(JSON.stringify(metric(data, METRIC_NAMES.dbPoolConnections))).toMatch(
      /"value":5.*"state":"total"|"state":"total".*"value":5/iu,
    );
    expect(pointValue(metric(data, METRIC_NAMES.dbPoolWaitingRequests))).toBe(1);
  });

  it("records AI outcomes without user content or resource identifiers", async () => {
    const { exporter, metrics, provider } = createHarness(providers);
    metrics.aiTurn("gpt-6-luna", "completed", 0.5);
    metrics.aiTool("get_itinerary", "success");
    metrics.aiProposal("itinerary_move", "generated");
    metrics.aiTokens("gpt-6-luna", {
      cachedInputTokens: 3,
      inputTokens: 10,
      outputTokens: 5,
      reasoningTokens: 2,
    });
    await provider.forceFlush();

    const data = metricData(exporter);
    const serialized = JSON.stringify(
      [
        METRIC_NAMES.aiTurns,
        METRIC_NAMES.aiDuration,
        METRIC_NAMES.aiToolCalls,
        METRIC_NAMES.aiProposals,
        METRIC_NAMES.aiTokens,
      ].map((name) => metric(data, name)),
    );
    expect(serialized).toMatch(/gpt-6-luna/iu);
    expect(serialized).toMatch(/get_itinerary/iu);
    expect(serialized).toMatch(/itinerary_move/iu);
    expect(serialized).not.toMatch(/prompt|message|userId|tripId|conversationId/iu);
  });
});

type ExportedMetric = {
  dataPoints: Array<{ value: number; attributes: Record<string, unknown> }>;
  descriptor: { name: string };
};

function createHarness(providers: MeterProvider[]) {
  const exporter = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE);
  const reader = new PeriodicExportingMetricReader({
    exporter,
    exportIntervalMillis: 60_000,
  });
  const provider = new MeterProvider({ readers: [reader] });
  providers.push(provider);
  return {
    exporter,
    metrics: new TripForgeMetrics(provider.getMeter("test")),
    provider,
  };
}

function metricData(exporter: InMemoryMetricExporter): ExportedMetric[] {
  return exporter
    .getMetrics()
    .flatMap((resource) => resource.scopeMetrics)
    .flatMap((scope) => scope.metrics) as unknown as ExportedMetric[];
}

function metric(data: ExportedMetric[], name: string): ExportedMetric {
  const found = data.find((entry) => entry.descriptor.name === name);
  expect(found).toBeDefined();
  return found!;
}

function pointValue(exportedMetric: ExportedMetric): number {
  expect(exportedMetric.dataPoints).toHaveLength(1);
  return exportedMetric.dataPoints[0]!.value;
}
