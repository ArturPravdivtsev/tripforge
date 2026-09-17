import { describe, expect, it } from "vitest";

import { calculateBounds } from "./bounds";

describe("calculateBounds", () => {
  it("returns no bounds for an empty point set", () => {
    expect(calculateBounds([])).toBeUndefined();
  });

  it("uses one point for every edge", () => {
    expect(calculateBounds([{ latitude: 35.6762, longitude: 139.6503 }])).toEqual({
      east: 139.6503,
      north: 35.6762,
      south: 35.6762,
      west: 139.6503,
    });
  });

  it("derives bounds across negative longitudes and mixed hemispheres", () => {
    expect(
      calculateBounds([
        { latitude: 35.6762, longitude: 139.6503 },
        { latitude: -33.8688, longitude: 151.2093 },
        { latitude: 40.7128, longitude: -74.006 },
      ]),
    ).toEqual({
      east: 151.2093,
      north: 40.7128,
      south: -33.8688,
      west: -74.006,
    });
  });
});
