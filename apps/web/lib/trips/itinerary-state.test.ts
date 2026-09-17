import type { ItineraryItem, TripDay } from "@tripforge/contracts";
import { describe, expect, it } from "vitest";

import {
  buildItineraryReorderRequest,
  flattenItineraryGroups,
  groupItineraryItems,
  moveItineraryItem,
} from "./itinerary-state";

const days: TripDay[] = [
  { date: "2027-04-12", destinationId: null, id: "day-1" },
  { date: "2027-04-13", destinationId: null, id: "day-2" },
];

function item(id: string, dayId: string, position: number): ItineraryItem {
  return {
    createdAt: "2027-01-01T00:00:00.000Z",
    dayId,
    id,
    kind: "activity",
    notes: null,
    position,
    startTime: null,
    title: id,
    updatedAt: "2027-01-01T00:00:00.000Z",
  };
}

describe("itinerary state", () => {
  it("groups and deterministically orders items while retaining empty Days", () => {
    const groups = groupItineraryItems(days, [
      item("B", "day-1", 1),
      item("A", "day-1", 0),
    ]);

    expect(groups["day-1"]?.map(({ id }) => id)).toEqual(["A", "B"]);
    expect(groups["day-2"]).toEqual([]);
  });

  it("moves within a Day and normalizes positions", () => {
    const before = groupItineraryItems(days, [
      item("A", "day-1", 0),
      item("B", "day-1", 1),
      item("C", "day-1", 2),
    ]);
    const after = moveItineraryItem(before, "day-1", 2, "day-1", 0);

    expect(flattenItineraryGroups(days, after)).toMatchObject([
      { id: "C", position: 0 },
      { id: "A", position: 1 },
      { id: "B", position: 2 },
    ]);
  });

  it("moves across Days and builds complete affected lists", () => {
    const before = groupItineraryItems(days, [
      item("A", "day-1", 0),
      item("B", "day-1", 1),
      item("C", "day-2", 0),
    ]);
    const after = moveItineraryItem(before, "day-1", 1, "day-2", 0);

    expect(flattenItineraryGroups(days, after)).toMatchObject([
      { dayId: "day-1", id: "A", position: 0 },
      { dayId: "day-2", id: "B", position: 0 },
      { dayId: "day-2", id: "C", position: 1 },
    ]);
    expect(buildItineraryReorderRequest(before, after)).toEqual({
      days: [
        { dayId: "day-1", itemIds: ["A"] },
        { dayId: "day-2", itemIds: ["B", "C"] },
      ],
    });
  });
});
