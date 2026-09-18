import type { TripRouteSegment } from "@tripforge/contracts";
import { describe, expect, it } from "vitest";

import { buildRouteFeatureCollection, routeCoordinates } from "./trip-map-routes";

const route: TripRouteSegment = {
  createdAt: "2027-01-01T00:00:00.000Z",
  distanceMeters: 100,
  durationSeconds: 60,
  fromItemId: "a",
  geometry: { coordinates: [[139.7, 35.7], [139.8, 35.8]], type: "LineString" },
  id: "route",
  mode: "walking",
  toItemId: "b",
  updatedAt: "2027-01-01T00:00:00.000Z",
};

describe("trip map routes", () => {
  it("creates a GeoJSON feature with mode and identity", () => {
    expect(buildRouteFeatureCollection([route])).toEqual({
      features: [{ geometry: route.geometry, properties: { mode: "walking", routeId: "route" }, type: "Feature" }],
      type: "FeatureCollection",
    });
  });

  it("derives bounds-ready coordinate objects", () => {
    expect(routeCoordinates([route])).toEqual([
      { latitude: 35.7, longitude: 139.7 },
      { latitude: 35.8, longitude: 139.8 },
    ]);
  });
});
