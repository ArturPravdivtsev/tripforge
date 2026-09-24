import { describe, expect, it, vi } from "vitest";

import {
  beginItineraryReorder,
  deferDuringItineraryReorder,
  endItineraryReorder,
} from "./itinerary-invalidation";

describe("itinerary realtime reconciliation", () => {
  it("defers remote invalidation until an active reorder settles", () => {
    const invalidate = vi.fn();

    beginItineraryReorder("trip-a");
    deferDuringItineraryReorder("trip-a", invalidate);
    expect(invalidate).not.toHaveBeenCalled();

    endItineraryReorder("trip-a");
    expect(invalidate).toHaveBeenCalledOnce();
  });

  it("runs immediately outside an active reorder", () => {
    const invalidate = vi.fn();
    deferDuringItineraryReorder("trip-b", invalidate);
    expect(invalidate).toHaveBeenCalledOnce();
  });
});
