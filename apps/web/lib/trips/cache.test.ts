import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import { clearTripCache } from "./cache";
import { tripKeys } from "./query-keys";

describe("clearTripCache", () => {
  it("removes document metadata with the Trip tree without clearing public state", async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(tripKeys.documents("trip-id"), [{ id: "document-id" }]);
    queryClient.setQueryData(["place-search", "maptiler", { query: "Tokyo" }], [
      { id: "place-id" },
    ]);

    await clearTripCache(queryClient);

    expect(queryClient.getQueryData(tripKeys.documents("trip-id"))).toBeUndefined();
    expect(
      queryClient.getQueryData([
        "place-search",
        "maptiler",
        { query: "Tokyo" },
      ]),
    ).toEqual([{ id: "place-id" }]);
  });
});
