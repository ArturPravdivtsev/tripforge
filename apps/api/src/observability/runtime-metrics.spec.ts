import { RuntimeNodeInstrumentation } from "@opentelemetry/instrumentation-runtime-node";
import {
  AggregationTemporality,
  InMemoryMetricExporter,
  MeterProvider,
  PeriodicExportingMetricReader,
} from "@opentelemetry/sdk-metrics";
import { describe, expect, it } from "vitest";

describe("Node runtime metrics", () => {
  it("emits representative runtime gauges in memory", async () => {
    const exporter = new InMemoryMetricExporter(
      AggregationTemporality.CUMULATIVE,
    );
    const provider = new MeterProvider({
      readers: [
        new PeriodicExportingMetricReader({
          exporter,
          exportIntervalMillis: 60_000,
        }),
      ],
    });
    const instrumentation = new RuntimeNodeInstrumentation({
      enabled: true,
      monitoringPrecision: 10,
    });
    instrumentation.setMeterProvider(provider);

    try {
      await new Promise((resolve) => setTimeout(resolve, 60));
      await provider.forceFlush();
      const names = exporter
        .getMetrics()
        .flatMap((resource) => resource.scopeMetrics)
        .flatMap((scope) => scope.metrics)
        .map((metric) => metric.descriptor.name);

      expect(names).toEqual(
        expect.arrayContaining([
          "nodejs.eventloop.utilization",
          "v8js.memory.heap.used",
        ]),
      );
    } finally {
      instrumentation.disable();
      await provider.shutdown();
    }
  });
});
