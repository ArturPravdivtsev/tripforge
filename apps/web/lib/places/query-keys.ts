import type { PlaceSearchProximity } from "./maptiler-geocoding";

export const placeSearchKeys = {
  mapTiler(query: string, proximity?: PlaceSearchProximity) {
    return ["place-search", "maptiler", { proximity, query }] as const;
  },
};
