import { describe, expect, it } from "vitest";

import { routeTemplate, validRequestId } from "./http-observability.middleware";

describe("HTTP observability boundaries", () => {
  it("accepts only UUID request IDs", () => {
    const requestId = "10000000-0000-4000-8000-000000000001";
    expect(validRequestId(requestId)).toBe(requestId);
    expect(validRequestId("attacker-controlled\nvalue")).toMatch(
      /^[0-9a-f-]{36}$/u,
    );
  });

  it("uses route templates and collapses unmatched attacker paths", () => {
    const firstTripRoute = routeTemplate({
      baseUrl: "/api/trips/10000000-0000-4000-8000-000000000001",
      route: { path: "/reservations/:reservationId" },
    } as never);
    const secondTripRoute = routeTemplate({
      baseUrl: "/api/trips/20000000-0000-4000-8000-000000000002",
      route: { path: "/reservations/:reservationId" },
    } as never);

    expect(firstTripRoute).toBe(
      "/api/trips/:id/reservations/:reservationId",
    );
    expect(secondTripRoute).toBe(firstTripRoute);
    expect(routeTemplate({ url: "/attacker/one" } as never)).toBe(
      "__unmatched__",
    );
    expect(routeTemplate({ url: "/attacker/two" } as never)).toBe(
      "__unmatched__",
    );
  });
});
