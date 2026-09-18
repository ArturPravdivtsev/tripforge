import type { TripRouteSegment } from "@tripforge/contracts";

export function buildRouteFeatureCollection(
  routes: readonly TripRouteSegment[],
) {
  return {
    features: routes.map((route) => ({
      geometry: route.geometry,
      properties: { mode: route.mode, routeId: route.id },
      type: "Feature" as const,
    })),
    type: "FeatureCollection" as const,
  };
}

export function routeCoordinates(routes: readonly TripRouteSegment[]) {
  return routes.flatMap((route) =>
    route.geometry.coordinates.map(([longitude, latitude]) => ({
      latitude,
      longitude,
    })),
  );
}
