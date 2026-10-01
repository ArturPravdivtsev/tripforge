import { registerOTel } from "@vercel/otel";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { register, safeInstrumentationRoute } from "./instrumentation";

vi.mock("@vercel/otel", () => ({ registerOTel: vi.fn() }));

const previousEnabled = process.env.OTEL_ENABLED;
const previousRuntime = process.env.NEXT_RUNTIME;

describe("Next server observability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_RUNTIME = "nodejs";
  });

  afterEach(() => {
    restore("OTEL_ENABLED", previousEnabled);
    restore("NEXT_RUNTIME", previousRuntime);
  });

  it("does not initialize telemetry when disabled", async () => {
    process.env.OTEL_ENABLED = "false";
    await register();
    expect(registerOTel).not.toHaveBeenCalled();
  });

  it("registers server-only tracing with the explicit service name", async () => {
    process.env.OTEL_ENABLED = "true";
    await register();
    expect(registerOTel).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceName: "tripforge-web",
        traceSampler: "parentbased_traceidratio",
      }),
    );
  });

  it("does not accept query-bearing routes in error telemetry", () => {
    expect(safeInstrumentationRoute("/trips/[tripId]")).toBe(
      "/trips/[tripId]",
    );
    expect(safeInstrumentationRoute("/search?q=secret")).toBe(
      "__unmatched__",
    );
  });
});

function restore(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
