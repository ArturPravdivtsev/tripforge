import { describe, expect, it } from "vitest";

import { generateTripDates, planDayReconciliation } from "./trip-calendar";

describe("trip calendar", () => {
  it("generates an inclusive timezone-safe calendar range", () => {
    expect(generateTripDates("2027-03-27", "2027-03-30")).toEqual([
      "2027-03-27",
      "2027-03-28",
      "2027-03-29",
      "2027-03-30",
    ]);
  });

  it("returns no dates when either boundary is absent", () => {
    expect(generateTripDates(null, "2027-04-12")).toEqual([]);
    expect(generateTripDates("2027-04-12", null)).toEqual([]);
  });

  it("plans only additions and removals while preserving overlap", () => {
    expect(
      planDayReconciliation(
        ["2027-04-12", "2027-04-13", "2027-04-14"],
        ["2027-04-13", "2027-04-14", "2027-04-15"],
      ),
    ).toEqual({ insert: ["2027-04-15"], remove: ["2027-04-12"] });
  });
});
