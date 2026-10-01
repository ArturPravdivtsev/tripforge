import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { describe, expect, it } from "vitest";

import { createHttpInstrumentation } from "./register";

describe("HTTP trace configuration", () => {
  it("exports a bounded server span without query, UUID, or client IP", async () => {
    const exporter = new InMemorySpanExporter();
    const provider = new BasicTracerProvider({
      spanProcessors: [new SimpleSpanProcessor(exporter)],
    });
    const config = createHttpInstrumentation().getConfig();
    const span = provider.getTracer("test").startSpan("GET");
    const request = {
      baseUrl: "/api/trips/10000000-0000-4000-8000-000000000001",
      headers: {},
      method: "GET",
      route: { path: "/search" },
      url: "/search?q=my-secret-trip-plan",
    };

    config.requestHook?.(span, request as never);
    config.applyCustomAttributesOnSpan?.(span, request as never, {} as never);
    span.end();
    await provider.forceFlush();

    const serverSpan = exporter.getFinishedSpans()[0];
    expect(serverSpan).toMatchObject({ name: "GET /api/trips/:id/search" });
    expect(serverSpan?.attributes).toMatchObject({
      "client.address": "__omitted__",
      "http.route": "/api/trips/:id/search",
      "network.peer.address": "__omitted__",
      "url.path": "/api/trips/:id/search",
      "url.query": "__omitted__",
    });
    expect(JSON.stringify(serverSpan?.attributes)).not.toMatch(
      /10000000|my-secret-trip-plan/iu,
    );
    await provider.shutdown();
  });
});
