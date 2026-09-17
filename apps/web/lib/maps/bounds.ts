import type { TripDestination } from "@tripforge/contracts";

export type MapPoint = Readonly<{
  latitude: number;
  longitude: number;
}>;

export type MapBounds = Readonly<{
  east: number;
  north: number;
  south: number;
  west: number;
}>;

export type LocatedDestination = TripDestination & {
  latitude: number;
  longitude: number;
};

export function hasCoordinates(
  destination: TripDestination,
): destination is LocatedDestination {
  return destination.latitude !== null && destination.longitude !== null;
}

export function calculateBounds(
  points: readonly MapPoint[],
): MapBounds | undefined {
  const first = points[0];
  if (!first) return undefined;

  return points.slice(1).reduce<MapBounds>(
    (bounds, point) => ({
      east: Math.max(bounds.east, point.longitude),
      north: Math.max(bounds.north, point.latitude),
      south: Math.min(bounds.south, point.latitude),
      west: Math.min(bounds.west, point.longitude),
    }),
    {
      east: first.longitude,
      north: first.latitude,
      south: first.latitude,
      west: first.longitude,
    },
  );
}
