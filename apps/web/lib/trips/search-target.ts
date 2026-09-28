import type { TripSearchTarget } from "@tripforge/contracts";

export function searchTargetHref(target: TripSearchTarget): string {
  const trip = `/trips/${target.tripId}`;

  switch (target.type) {
    case "trip":
      return trip;
    case "reservations":
      return `${trip}/reservations`;
    case "expenses":
      return `${trip}/expenses`;
    case "documents":
      return `${trip}/documents`;
  }
}
