import { describe, expect, it } from "vitest";

import { readObservabilityConfig } from "./observability-config";

describe("readObservabilityConfig", () => {
  it("keeps telemetry disabled by default in tests", () => {
    expect(
      readObservabilityConfig("tripforge-api", { NODE_ENV: "test" }),
    ).toMatchObject({
      enabled: false,
      logLevel: "info",
      samplingRatio: 1,
      serviceName: "tripforge-api",
    });
  });

  it("uses a production-oriented sampling default", () => {
    expect(
      readObservabilityConfig("tripforge-worker", {
        NODE_ENV: "production",
        OTEL_ENABLED: "true",
      }),
    ).toMatchObject({
      enabled: true,
      samplingRatio: 0.1,
      serviceName: "tripforge-worker",
    });
  });

  it("does not turn an unknown log level into maximum verbosity", () => {
    expect(
      readObservabilityConfig("tripforge-api", {
        LOG_LEVEL: "everything",
        NODE_ENV: "production",
      }).logLevel,
    ).toBe("info");
  });
});
