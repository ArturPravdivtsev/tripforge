import { describe, expect, it } from "vitest";

import { isCalendarDate } from "./calendar-date.validator";

describe("isCalendarDate", () => {
  it.each(["2027-04-12", "2028-02-29", "0001-01-01"])(
    "accepts a real YYYY-MM-DD calendar date: %s",
    (value) => {
      expect(isCalendarDate(value)).toBe(true);
    },
  );

  it.each([
    "2027-13-01",
    "2027-02-30",
    "2027/04/12",
    "April 12 2027",
    "0000-01-01",
    null,
  ])("rejects malformed or impossible calendar dates: %s", (value) => {
    expect(isCalendarDate(value)).toBe(false);
  });
});
