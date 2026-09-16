import { describe, expect, it } from "vitest";

import { formatTripDates, isCalendarDate } from "./calendar-date";

describe("calendar dates", () => {
  it.each(["2027-04-12", "2028-02-29", "0001-01-01"])(
    "accepts valid date %s",
    (value) => {
      expect(isCalendarDate(value)).toBe(true);
    },
  );

  it.each(["2027-02-30", "2027-13-01", "2027/04/12", "2027-2-01"])(
    "rejects invalid date %s",
    (value) => {
      expect(isCalendarDate(value)).toBe(false);
    },
  );

  it("formats without timezone conversion", () => {
    expect(formatTripDates("2027-04-12", "2027-04-28")).toBe(
      "12 Apr 2027 – 28 Apr 2027",
    );
    expect(formatTripDates("2027-04-12", null)).toBe("From 12 Apr 2027");
    expect(formatTripDates(null, "2027-04-28")).toBe("Until 28 Apr 2027");
    expect(formatTripDates(null, null)).toBe("Dates not set");
  });
});
