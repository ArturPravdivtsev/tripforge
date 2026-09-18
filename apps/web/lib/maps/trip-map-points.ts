import type {
  ItineraryItem,
  ItineraryItemKind,
  TripDay,
  TripDestination,
} from "@tripforge/contracts";

export type TripMapPoint =
  | Readonly<{
      id: string;
      label: string;
      latitude: number;
      longitude: number;
      position: number;
      type: "destination";
    }>
  | Readonly<{
      address: string | null;
      dayNumber: number;
      id: string;
      kind: ItineraryItemKind;
      label: string;
      latitude: number;
      longitude: number;
      startTime: string | null;
      type: "itinerary";
    }>;

export type TripMapSelection = Pick<TripMapPoint, "id" | "type">;

export function buildTripMapPoints(
  destinations: readonly TripDestination[],
  days: readonly TripDay[],
  items: readonly ItineraryItem[],
): TripMapPoint[] {
  const dayNumbers = new Map(days.map((day, index) => [day.id, index + 1]));

  return [
    ...destinations.flatMap<TripMapPoint>((destination) =>
      destination.latitude === null || destination.longitude === null
        ? []
        : [
            {
              id: destination.id,
              label: destination.name,
              latitude: destination.latitude,
              longitude: destination.longitude,
              position: destination.position,
              type: "destination",
            },
          ],
    ),
    ...items.flatMap<TripMapPoint>((item) =>
      item.place
        ? [
            {
              address: item.place.address,
              dayNumber: dayNumbers.get(item.dayId) ?? 0,
              id: item.id,
              kind: item.kind,
              label: item.place.name,
              latitude: item.place.latitude,
              longitude: item.place.longitude,
              startTime: item.startTime,
              type: "itinerary",
            },
          ]
        : [],
    ),
  ];
}
