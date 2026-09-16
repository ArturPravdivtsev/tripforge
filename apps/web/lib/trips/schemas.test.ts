import { describe, expect, it } from "vitest";

import { tripFormSchema } from "./schemas";

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
