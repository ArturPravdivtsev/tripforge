import { describe, expect, it } from "vitest";

import { searchTargetHref } from "./search-target";

describe("searchTargetHref", () => {
  it("maps typed domain targets without accepting raw URLs", () => {
    expect(searchTargetHref({ tripId: "trip", type: "trip" })).toBe("/trips/trip");
    expect(searchTargetHref({ tripId: "trip", type: "reservations" })).toBe(
      "/trips/trip/reservations",
    );
    expect(searchTargetHref({ tripId: "trip", type: "expenses" })).toBe(
      "/trips/trip/expenses",
    );
    expect(searchTargetHref({ tripId: "trip", type: "documents" })).toBe(
      "/trips/trip/documents",
    );
  });
});
