import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import { tripKeys } from "@/lib/trips/query-keys";

import {
  invalidateRealtimeResources,
  queryKeysForRealtimeResource,
} from "./query-invalidation";

describe("realtime query invalidation", () => {
  it("maps finite backend resources to frontend query subtrees", () => {
    expect(queryKeysForRealtimeResource("trip", "trip")).toEqual([
      tripKeys.detail("trip"),
      tripKeys.lists(),
    ]);
    expect(queryKeysForRealtimeResource("trip", "expenses")).toEqual([
      tripKeys.expenses("trip"),
      tripKeys.searches("trip"),
    ]);
    expect(queryKeysForRealtimeResource("trip", "reservations")).toEqual([
      tripKeys.reservations("trip"),
      tripKeys.searches("trip"),
    ]);
    expect(queryKeysForRealtimeResource("trip", "routes")).toEqual([
      tripKeys.routes("trip"),
    ]);
  });

  it("deduplicates keys and uses an exact active-only Trip detail refetch", async () => {
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    await invalidateRealtimeResources(queryClient, "trip", [
      "trip",
      "trip",
    ]);

    expect(invalidate).toHaveBeenCalledTimes(2);
    expect(invalidate).toHaveBeenCalledWith({
      exact: true,
      queryKey: tripKeys.detail("trip"),
      refetchType: "active",
    });
    expect(invalidate).toHaveBeenCalledWith({
      exact: false,
      queryKey: tripKeys.lists(),
      refetchType: "active",
    });
  });
});
