import type { ItineraryPlaceInput } from "@tripforge/contracts";
import { z } from "zod";
import "@/lib/security/zod-csp";

const MAPTILER_GEOCODING_URL = "https://api.maptiler.com/geocoding";

const mapTilerResponseSchema = z.object({
  attribution: z.string().min(1).max(5000),
  features: z.array(
    z.object({
      center: z.tuple([
        z.number().finite().min(-180).max(180),
        z.number().finite().min(-90).max(90),
      ]),
      id: z.string().min(1).max(300),
      place_name: z.string().min(1).max(500),
      text: z.string().min(1).max(200),
    }),
  ),
  type: z.literal("FeatureCollection"),
});

export type PlaceSearchProximity = Readonly<{
  latitude: number;
  longitude: number;
}>;

export type PlaceSearchResult = ItineraryPlaceInput;

export type PlaceSearchResponse = Readonly<{
  attribution: string;
  results: PlaceSearchResult[];
}>;

export class PlaceSearchError extends Error {}

export function buildMapTilerGeocodingUrl(
  query: string,
  key: string,
  proximity?: PlaceSearchProximity,
): string {
  const parameters = new URLSearchParams({
    autocomplete: "true",
    key,
    limit: "6",
  });

  if (proximity) {
    parameters.set("proximity", `${proximity.longitude},${proximity.latitude}`);
  }

  return `${MAPTILER_GEOCODING_URL}/${encodeURIComponent(query)}.json?${parameters.toString()}`;
}

export async function searchMapTilerPlaces({
  fetcher = fetch,
  key,
  proximity,
  query,
  signal,
}: Readonly<{
  fetcher?: typeof fetch;
  key: string;
  proximity?: PlaceSearchProximity;
  query: string;
  signal?: AbortSignal;
}>): Promise<PlaceSearchResponse> {
  const response = await fetcher(
    buildMapTilerGeocodingUrl(query.trim(), key, proximity),
    { signal },
  );

  if (!response.ok) {
    throw new PlaceSearchError("MapTiler place search request failed");
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new PlaceSearchError("MapTiler place search response was malformed");
  }

  const parsed = mapTilerResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new PlaceSearchError("MapTiler place search response was malformed");
  }

  return {
    attribution: parsed.data.attribution,
    results: parsed.data.features.map((feature) => ({
      address:
        feature.place_name.trim() === feature.text.trim()
          ? null
          : feature.place_name.trim(),
      latitude: feature.center[1],
      longitude: feature.center[0],
      name: feature.text.trim(),
      provider: "maptiler",
      providerReference: feature.id,
    })),
  };
}
