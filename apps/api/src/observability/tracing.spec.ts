import { trace } from "@opentelemetry/api";
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { afterAll, describe, expect, it } from "vitest";

import { withClientSpan, withInternalSpan } from "./tracing";

const exporter = new InMemorySpanExporter();
const provider = new BasicTracerProvider({
  spanProcessors: [new SimpleSpanProcessor(exporter)],
});
trace.setGlobalTracerProvider(provider);

describe("domain tracing", () => {
  afterAll(async () => provider.shutdown());

  it("exports a bounded internal span in memory", async () => {
    await withInternalSpan(
      "route.calculate",
      { "tripforge.route.mode": "walking" },
      async () => "ok",
    );

    expect(exporter.getFinishedSpans()).toEqual([
      expect.objectContaining({
        attributes: { "tripforge.route.mode": "walking" },
        name: "route.calculate",
      }),
    ]);
  });

  it("exports a provider span without URL or credential attributes", async () => {
    exporter.reset();
    await withClientSpan(
      "openrouteservice directions",
      {
        "tripforge.provider": "openrouteservice",
        "tripforge.provider.operation": "directions",
      },
      async () => "ok",
    );

    const serialized = JSON.stringify(
      exporter.getFinishedSpans().map((span) => ({
        attributes: span.attributes,
        name: span.name,
      })),
    );
    expect(serialized).toContain("openrouteservice");
    expect(serialized).not.toMatch(/authorization|api.?key|query|secret/iu);
  });
});
