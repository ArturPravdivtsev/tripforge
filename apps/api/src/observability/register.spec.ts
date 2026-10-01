import { describe, expect, it } from "vitest";

import { safeTelemetryRoute } from "./register";

describe("HTTP trace privacy", () => {
  it("exports route templates rather than UUID paths or queries", () => {
    const request = {
      baseUrl: "/api/trips/10000000-0000-4000-8000-000000000001",
      route: { path: "/search" },
      url: "/search?q=my-secret-trip-plan",
    };

    const route = safeTelemetryRoute(request as never);
    expect(route).toBe("/api/trips/:id/search");
    expect(route).not.toMatch(/10000000|my-secret-trip-plan|\?/u);
  });

  it("groups unknown paths into one trace identity", () => {
    expect(safeTelemetryRoute({ url: "/attack/one" } as never)).toBe(
      "__unmatched__",
    );
    expect(safeTelemetryRoute({ url: "/attack/two" } as never)).toBe(
      "__unmatched__",
    );
  });
});
