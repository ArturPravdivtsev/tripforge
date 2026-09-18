import { ConfigService } from "@nestjs/config";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  OpenRouteServiceClient,
  OPENROUTESERVICE_BASE_URL,
  RoutingProviderError,
} from "./openrouteservice.client";

const validResponse = {
  features: [
    {
      geometry: {
        coordinates: [[139.7967, 35.7148], [139.8107, 35.7101]],
        type: "LineString",
      },
      properties: { summary: { distance: 2400.4, duration: 1874.6 } },
      type: "Feature",
    },
  ],
  type: "FeatureCollection",
};

function subject(key = "secret-key") {
  return new OpenRouteServiceClient({
    get: vi.fn(() => key),
  } as unknown as ConfigService);
}

describe("OpenRouteServiceClient", () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each([
    ["walking", "foot-walking"],
    ["cycling", "cycling-regular"],
    ["driving", "driving-car"],
  ] as const)("maps %s to %s and normalizes GeoJSON", async (mode, profile) => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(validResponse), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const route = await subject().calculate(
      mode,
      { latitude: 35.7148, longitude: 139.7967 },
      { latitude: 35.7101, longitude: 139.8107 },
    );

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${OPENROUTESERVICE_BASE_URL}/directions/${profile}/geojson`);
    expect(options.method).toBe("POST");
    expect(new Headers(options.headers)).toMatchObject(expect.any(Headers));
    expect(new Headers(options.headers).get("Authorization")).toBe("secret-key");
    expect(new Headers(options.headers).get("Accept")).toBe("application/geo+json");
    expect(JSON.parse(String(options.body))).toEqual({
      coordinates: [[139.7967, 35.7148], [139.8107, 35.7101]],
    });
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(route).toEqual({
      distanceMeters: 2400,
      durationSeconds: 1875,
      geometry: validResponse.features[0]?.geometry,
    });
  });

  it("fails without a configured key before fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      subject("").calculate(
        "walking",
        { latitude: 1, longitude: 2 },
        { latitude: 3, longitude: 4 },
      ),
    ).rejects.toMatchObject({ code: "unavailable" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    [429, "rate-limited"],
    [422, "not-found"],
    [401, "unavailable"],
    [403, "unavailable"],
    [500, "unavailable"],
  ])("maps provider status %s to %s", async (status, code) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status })));
    await expect(
      subject().calculate(
        "walking",
        { latitude: 1, longitude: 2 },
        { latitude: 3, longitude: 4 },
      ),
    ).rejects.toMatchObject({ code });
  });

  it.each([
    ["malformed JSON", () => new Response("not-json")],
    ["empty features", () => new Response(JSON.stringify({ type: "FeatureCollection", features: [] }))],
    ["malformed geometry", () => new Response(JSON.stringify({ ...validResponse, features: [{ ...validResponse.features[0], geometry: { type: "LineString", coordinates: [[999, 1]] } }] }))],
    ["missing summary", () => new Response(JSON.stringify({ ...validResponse, features: [{ ...validResponse.features[0], properties: {} }] }))],
  ])("rejects %s", async (_label, response) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response()));
    await expect(
      subject().calculate(
        "walking",
        { latitude: 1, longitude: 2 },
        { latitude: 3, longitude: 4 },
      ),
    ).rejects.toBeInstanceOf(RoutingProviderError);
  });

  it("maps fetch rejection and timeout to unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new DOMException("timeout", "TimeoutError")));
    await expect(
      subject().calculate(
        "walking",
        { latitude: 1, longitude: 2 },
        { latitude: 3, longitude: 4 },
      ),
    ).rejects.toMatchObject({ code: "unavailable" });
  });
});
