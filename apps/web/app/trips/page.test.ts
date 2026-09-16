import { describe, expect, it } from "vitest";

import { parseTripsPage } from "@/lib/trips/pagination";

describe("parseTripsPage", () => {
  it.each([
    [undefined, 1],
    ["banana", 1],
    ["-15", 1],
    ["0", 1],
    ["2.5", 1],
    ["2", 2],
    [["3", "4"], 3],
  ] as const)("normalizes %j to %s", (value, expected) => {
    expect(parseTripsPage(value)).toBe(expected);
  });
});
