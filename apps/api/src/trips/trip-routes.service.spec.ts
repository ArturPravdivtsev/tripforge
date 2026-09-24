import { describe, expect, it, vi } from "vitest";

import {
  OpenRouteServiceClient,
  RoutingProviderError,
} from "../routing/openrouteservice.client";
import { TripRealtimePublisher } from "../realtime/trip-realtime.publisher";
import { TripPermissionsService } from "./trip-permissions.service";
import { TripRoutesRepository } from "./trip-routes.repository";
import { TripRoutesService } from "./trip-routes.service";

function createSubject() {
  const routes = {
    create: vi.fn().mockResolvedValue({ id: "route" }),
    delete: vi.fn(),
    find: vi.fn(),
    getEndpoints: vi.fn().mockResolvedValue([
      { itemId: "from", latitude: 35.7, longitude: 139.7 },
      { itemId: "to", latitude: 35.8, longitude: 139.8 },
    ]),
    list: vi.fn(),
    pairExists: vi.fn().mockResolvedValue(false),
    update: vi.fn(),
  };
  const permissions = {
    requireEditable: vi.fn().mockResolvedValue({}),
    requireReadable: vi.fn().mockResolvedValue({}),
  };
  const provider = {
    calculate: vi.fn().mockResolvedValue({
      distanceMeters: 100,
      durationSeconds: 60,
      geometry: { coordinates: [[139.7, 35.7], [139.8, 35.8]], type: "LineString" },
    }),
  };
  return {
    provider,
    routes,
    service: new TripRoutesService(
      routes as unknown as TripRoutesRepository,
      permissions as unknown as TripPermissionsService,
      provider as unknown as OpenRouteServiceClient,
      new TripRealtimePublisher(),
    ),
  };
}

describe("TripRoutesService", () => {
  it("calculates outside the repository and persists normalized output", async () => {
    const { provider, routes, service } = createSubject();
    await service.create("editor", "trip", {
      fromItemId: "from",
      mode: "walking",
      toItemId: "to",
    });

    expect(provider.calculate).toHaveBeenCalledWith(
      "walking",
      { itemId: "from", latitude: 35.7, longitude: 139.7 },
      { itemId: "to", latitude: 35.8, longitude: 139.8 },
    );
    expect(routes.create).toHaveBeenCalledAfter(provider.calculate);
  });

  it("rejects same endpoints and duplicates before provider traffic", async () => {
    const { provider, routes, service } = createSubject();
    await expect(service.create("owner", "trip", {
      fromItemId: "same", mode: "walking", toItemId: "same",
    })).rejects.toMatchObject({ response: { code: "ROUTE_ENDPOINTS_MUST_DIFFER" } });

    routes.pairExists.mockResolvedValue(true);
    await expect(service.create("owner", "trip", {
      fromItemId: "from", mode: "walking", toItemId: "to",
    })).rejects.toMatchObject({ response: { code: "ROUTE_ALREADY_EXISTS" } });
    expect(provider.calculate).not.toHaveBeenCalled();
  });

  it("rejects foreign/missing and non-geolocated endpoints", async () => {
    const { routes, service } = createSubject();
    routes.getEndpoints.mockResolvedValueOnce([]);
    await expect(service.create("owner", "trip", {
      fromItemId: "from", mode: "walking", toItemId: "to",
    })).rejects.toMatchObject({ response: { code: "ROUTE_ENDPOINT_NOT_FOUND" } });

    routes.getEndpoints.mockResolvedValueOnce([
      { itemId: "from", latitude: null, longitude: null },
      { itemId: "to", latitude: 1, longitude: 2 },
    ]);
    await expect(service.create("owner", "trip", {
      fromItemId: "from", mode: "walking", toItemId: "to",
    })).rejects.toMatchObject({ response: { code: "ROUTE_ENDPOINT_HAS_NO_LOCATION" } });
  });

  it.each([
    ["unavailable", "ROUTING_PROVIDER_UNAVAILABLE"],
    ["rate-limited", "ROUTING_PROVIDER_RATE_LIMITED"],
    ["not-found", "ROUTE_NOT_FOUND"],
    ["invalid-response", "INVALID_ROUTING_RESPONSE"],
  ] as const)("maps provider %s without leaking internals", async (providerCode, apiCode) => {
    const { provider, service } = createSubject();
    provider.calculate.mockRejectedValue(new RoutingProviderError(providerCode));
    await expect(service.create("owner", "trip", {
      fromItemId: "from", mode: "driving", toItemId: "to",
    })).rejects.toMatchObject({ response: { code: apiCode } });
  });
});
