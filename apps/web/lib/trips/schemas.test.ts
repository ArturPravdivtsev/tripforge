import { describe, expect, it } from "vitest";

import { itineraryItemFormSchema, tripFormSchema } from "./schemas";

describe("tripFormSchema", () => {
  it("trims a valid name and permits empty dates", () => {
    expect(
      tripFormSchema.parse({ endsOn: "", name: "  Japan 2027  ", startsOn: "" }),
    ).toEqual({ endsOn: "", name: "Japan 2027", startsOn: "" });
  });

  it.each(["2027-02-30", "2027-13-01", "2027/04/12"])(
    "rejects malformed calendar date %s",
    (startsOn) => {
      expect(
        tripFormSchema.safeParse({ endsOn: "", name: "Japan", startsOn }).success,
      ).toBe(false);
    },
  );

  it("rejects an inverted date range", () => {
    const result = tripFormSchema.safeParse({
      endsOn: "2027-04-11",
      name: "Japan",
      startsOn: "2027-04-12",
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["endsOn"]);
  });
});

describe("itineraryItemFormSchema", () => {
  const valid = {
    endTime: "10:30",
    kind: "activity",
    notes: "",
    place: null,
    startTime: "09:05",
    title: "  Museum  ",
  };

  it("trims a valid title and optional notes", () => {
    expect(itineraryItemFormSchema.parse(valid)).toEqual({
      ...valid,
      notes: "",
      title: "Museum",
    });
  });

  it.each(["24:00", "9:30", "09:60", "09:30:00", "9pm"])(
    "rejects malformed wall-clock time %s",
    (startTime) => {
      expect(
        itineraryItemFormSchema.safeParse({ ...valid, startTime }).success,
      ).toBe(false);
    },
  );

  it("rejects a malformed end time", () => {
    expect(
      itineraryItemFormSchema.safeParse({ ...valid, endTime: "10:99" }).success,
    ).toBe(false);
  });

  it("rejects blank titles and notes beyond the application limit", () => {
    expect(
      itineraryItemFormSchema.safeParse({ ...valid, title: "   " }).success,
    ).toBe(false);
    expect(
      itineraryItemFormSchema.safeParse({
        ...valid,
        notes: "x".repeat(5001),
      }).success,
    ).toBe(false);
  });
});
