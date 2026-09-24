import { describe, expect, it } from "vitest";

import {
  tripInvalidateEventSchema,
  tripPresenceEventSchema,
} from "./schemas";

const TRIP_ID = "00000000-0000-4000-8000-000000000001";

describe("realtime payload schemas", () => {
  it("accepts minimal finite invalidation payloads", () => {
    expect(
      tripInvalidateEventSchema.safeParse({
        resources: ["trip", "itinerary"],
        tripId: TRIP_ID,
      }).success,
    ).toBe(true);
  });

  it("rejects arbitrary resources, malformed UUIDs, and presence emails", () => {
    expect(
      tripInvalidateEventSchema.safeParse({
        resources: ["database"],
        tripId: TRIP_ID,
      }).success,
    ).toBe(false);
    expect(
      tripPresenceEventSchema.safeParse({
        tripId: "not-a-uuid",
        users: [],
      }).success,
    ).toBe(false);
    expect(
      tripPresenceEventSchema.safeParse({
        tripId: TRIP_ID,
        users: [{ displayName: "Anna", email: "private@example.com", userId: TRIP_ID }],
      }).success,
    ).toBe(false);
  });
});
