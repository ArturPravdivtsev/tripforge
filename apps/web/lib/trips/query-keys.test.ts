import { describe, expect, it } from "vitest";

import { tripKeys } from "./query-keys";

describe("Trip query keys", () => {
  it("keeps expenses and documents below the Trip cache tree", () => {
    expect(tripKeys.expenses("trip-id")).toEqual([
      "trips",
      "detail",
      "trip-id",
      "expenses",
    ]);
    expect(tripKeys.expense("trip-id", "expense-id")).toEqual([
      "trips",
      "detail",
      "trip-id",
      "expenses",
      "detail",
      "expense-id",
    ]);
    expect(tripKeys.expenseBalances("trip-id")).toEqual([
      "trips",
      "detail",
      "trip-id",
      "expenses",
      "balances",
    ]);
    expect(tripKeys.documents("trip-id")).toEqual([
      "trips",
      "detail",
      "trip-id",
      "documents",
    ]);
    expect(tripKeys.search("trip-id", "Kyoto", "all")).toEqual([
      "trips",
      "detail",
      "trip-id",
      "search",
      { limit: 20, query: "Kyoto", types: "all" },
    ]);
  });
});
