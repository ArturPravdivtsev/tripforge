import { describe, expect, it, vi } from "vitest";

import {
  buildMapTilerGeocodingUrl,
  PlaceSearchError,
  searchMapTilerPlaces,
} from "./maptiler-geocoding";

const responseBody = {
  attribution: "© MapTiler © OpenStreetMap contributors",
  features: [
    {
      center: [139.7967, 35.7148],
      id: "poi.123",
      place_name: "Senso-ji, 2 Chome-3-1 Asakusa, Tokyo",
      text: "Senso-ji",
    },
  ],
  type: "FeatureCollection",
};

describe("MapTiler geocoding client", () => {
  it("builds a bounded autocomplete request with optional lon/lat proximity", () => {
    const url = new URL(
      buildMapTilerGeocodingUrl("Senso ji", "public key", {
        latitude: 35.6762,
        longitude: 139.6503,
      }),
    );

    expect(url.pathname).toBe("/geocoding/Senso%20ji.json");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      autocomplete: "true",
      key: "public key",
      limit: "6",
      proximity: "139.6503,35.6762",
    });
    expect(buildMapTilerGeocodingUrl("Paris", "key")).not.toContain(
      "proximity",
    );
  });

  it("forwards AbortSignal and normalizes only the consumed snapshot", async () => {
    const signal = new AbortController().signal;
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(responseBody), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      }),
    );

    await expect(
      searchMapTilerPlaces({ fetcher, key: "key", query: " Senso ", signal }),
    ).resolves.toEqual({
      attribution: responseBody.attribution,
      results: [
        {
          address: "Senso-ji, 2 Chome-3-1 Asakusa, Tokyo",
          latitude: 35.7148,
          longitude: 139.7967,
          name: "Senso-ji",
          provider: "maptiler",
          providerReference: "poi.123",
        },
      ],
    });
    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining("/Senso.json?"),
      { signal },
    );
  });

  it("isolates provider errors and malformed responses", async () => {
    const failed = vi.fn().mockResolvedValue(new Response("", { status: 429 }));
    const malformed = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ...responseBody, attribution: undefined }), {
        status: 200,
      }),
    );

    await expect(
      searchMapTilerPlaces({ fetcher: failed, key: "key", query: "Paris" }),
    ).rejects.toBeInstanceOf(PlaceSearchError);
    await expect(
      searchMapTilerPlaces({ fetcher: malformed, key: "key", query: "Paris" }),
    ).rejects.toBeInstanceOf(PlaceSearchError);
  });
});
