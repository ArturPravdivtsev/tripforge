import { describe, expect, it } from "vitest";

import { tripKeys } from "./query-keys";

describe("expense query keys", () => {
  it("keeps list, detail and balances below the Trip cache tree", () => {
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
  });
});
