import type { ItineraryItem, TripDay, TripDestination } from "@tripforge/contracts";
import { describe, expect, it } from "vitest";

import { buildTripMapPoints } from "./trip-map-points";

const destinations: TripDestination[] = [
  {
    createdAt: "2027-01-01T00:00:00.000Z",
    id: "tokyo",
    latitude: 35.6762,
    longitude: 139.6503,
    name: "Tokyo",
    position: 0,
    updatedAt: "2027-01-01T00:00:00.000Z",
  },
];
const days: TripDay[] = [
  { date: "2027-04-12", destinationId: "tokyo", id: "day-1" },
  { date: "2027-04-13", destinationId: null, id: "day-2" },
];
const item: ItineraryItem = {
  createdAt: "2027-01-01T00:00:00.000Z",
  dayId: "day-1",
  id: "senso",
  kind: "activity",
  notes: null,
  place: {
    address: "Asakusa, Tokyo",
    latitude: 35.7148,
    longitude: 139.7967,
    name: "Senso-ji",
    provider: "maptiler",
    providerReference: "poi.123",
  },
  position: 0,
  startTime: "09:00",
  title: "Morning temple visit",
  updatedAt: "2027-01-01T00:00:00.000Z",
};

describe("trip map points", () => {
  it("creates distinct destination and itinerary presentation points", () => {
    expect(buildTripMapPoints(destinations, days, [item])).toEqual([
      expect.objectContaining({ id: "tokyo", type: "destination" }),
      expect.objectContaining({
        address: "Asakusa, Tokyo",
        dayNumber: 1,
        id: "senso",
        kind: "activity",
        label: "Senso-ji",
        startTime: "09:00",
        type: "itinerary",
      }),
    ]);
  });

  it("keeps the same geographic point when an item moves to another Day", () => {
    const before = buildTripMapPoints([], days, [item])[0];
    const after = buildTripMapPoints([], days, [{ ...item, dayId: "day-2", position: 3 }])[0];

    expect(after).toMatchObject({
      dayNumber: 2,
      id: before?.id,
      latitude: before?.latitude,
      longitude: before?.longitude,
      type: "itinerary",
    });
  });
});
