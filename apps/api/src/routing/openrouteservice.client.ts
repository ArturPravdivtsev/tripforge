import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type {
  TripRouteGeometry,
  TripRouteMode,
} from "@tripforge/contracts";

import { ObservabilityMetrics } from "../observability/metrics.service";
import { withClientSpan, withInternalSpan } from "../observability/tracing";

const OPENROUTESERVICE_BASE_URL =
  "https://api.heigit.org/openrouteservice/v2";
const ROUTING_TIMEOUT_MS = 9_000;

const profiles: Record<TripRouteMode, string> = {
  cycling: "cycling-regular",
  driving: "driving-car",
  walking: "foot-walking",
};

export type RouteCoordinates = Readonly<{
  latitude: number;
  longitude: number;
}>;

export type CalculatedRoute = Readonly<{
  distanceMeters: number;
  durationSeconds: number;
  geometry: TripRouteGeometry;
}>;

export type RoutingProviderErrorCode =
  | "unavailable"
  | "rate-limited"
  | "not-found"
  | "invalid-response";

export class RoutingProviderError extends Error {
  constructor(readonly code: RoutingProviderErrorCode) {
    super(code);
    this.name = "RoutingProviderError";
  }
}

@Injectable()
export class OpenRouteServiceClient {
  constructor(
    private readonly config: ConfigService,
    private readonly metrics: ObservabilityMetrics = new ObservabilityMetrics(),
  ) {}

  async calculate(
    mode: TripRouteMode,
    origin: RouteCoordinates,
    destination: RouteCoordinates,
  ): Promise<CalculatedRoute> {
    const startedAt = process.hrtime.bigint();
    return withInternalSpan(
      "route.calculate",
      { "tripforge.route.mode": mode },
      async () => {
        try {
          const result = await this.request(mode, origin, destination);
          this.metrics.providerRequest(mode, "success", elapsedSeconds(startedAt));
          return result;
        } catch (error) {
          this.metrics.providerRequest(mode, "failure", elapsedSeconds(startedAt));
          throw error;
        }
      },
    );
  }

  private async request(
    mode: TripRouteMode,
    origin: RouteCoordinates,
    destination: RouteCoordinates,
  ): Promise<CalculatedRoute> {
    const apiKey = this.config.get<string>("OPENROUTESERVICE_API_KEY")?.trim();
    if (!apiKey) throw new RoutingProviderError("unavailable");

    let response: Response;
    try {
      response = await withClientSpan(
        "openrouteservice directions",
        {
          "server.address": "api.heigit.org",
          "tripforge.provider": "openrouteservice",
          "tripforge.provider.operation": "directions",
          "tripforge.route.mode": mode,
        },
        async () =>
          fetch(
            `${OPENROUTESERVICE_BASE_URL}/directions/${profiles[mode]}/geojson`,
            {
              body: JSON.stringify({
                coordinates: [
                  [origin.longitude, origin.latitude],
                  [destination.longitude, destination.latitude],
                ],
              }),
              headers: {
                Accept: "application/geo+json",
                Authorization: apiKey,
                "Content-Type": "application/json",
              },
              method: "POST",
              signal: AbortSignal.timeout(ROUTING_TIMEOUT_MS),
            },
          ),
      );
    } catch {
      throw new RoutingProviderError("unavailable");
    }

    if (response.status === 429) {
      throw new RoutingProviderError("rate-limited");
    }
    if (response.status === 404 || response.status === 422) {
      throw new RoutingProviderError("not-found");
    }
    if (!response.ok) {
      throw new RoutingProviderError("unavailable");
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new RoutingProviderError("invalid-response");
    }

    return normalizeRouteResponse(payload);
  }
}

function elapsedSeconds(startedAt: bigint): number {
  return Number(process.hrtime.bigint() - startedAt) / 1_000_000_000;
}

function normalizeRouteResponse(payload: unknown): CalculatedRoute {
  if (!isRecord(payload) || payload.type !== "FeatureCollection") {
    throw new RoutingProviderError("invalid-response");
  }
  if (!Array.isArray(payload.features) || payload.features.length === 0) {
    throw new RoutingProviderError("not-found");
  }

  const feature = payload.features[0];
  if (!isRecord(feature) || feature.type !== "Feature") {
    throw new RoutingProviderError("invalid-response");
  }
  const geometry = feature.geometry;
  const properties = feature.properties;
  if (
    !isRecord(geometry) ||
    geometry.type !== "LineString" ||
    !Array.isArray(geometry.coordinates) ||
    geometry.coordinates.length < 2 ||
    !isRecord(properties) ||
    !isRecord(properties.summary)
  ) {
    throw new RoutingProviderError("invalid-response");
  }

  const coordinates = geometry.coordinates.map(validateCoordinatePair);
  const distance = properties.summary.distance;
  const duration = properties.summary.duration;
  if (
    typeof distance !== "number" ||
    !Number.isFinite(distance) ||
    distance < 0 ||
    typeof duration !== "number" ||
    !Number.isFinite(duration) ||
    duration < 0
  ) {
    throw new RoutingProviderError("invalid-response");
  }

  return {
    distanceMeters: Math.round(distance),
    durationSeconds: Math.round(duration),
    geometry: { coordinates, type: "LineString" },
  };
}

function validateCoordinatePair(value: unknown): [number, number] {
  if (
    !Array.isArray(value) ||
    value.length < 2 ||
    typeof value[0] !== "number" ||
    !Number.isFinite(value[0]) ||
    value[0] < -180 ||
    value[0] > 180 ||
    typeof value[1] !== "number" ||
    !Number.isFinite(value[1]) ||
    value[1] < -90 ||
    value[1] > 90
  ) {
    throw new RoutingProviderError("invalid-response");
  }

  return [value[0], value[1]];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export { OPENROUTESERVICE_BASE_URL, ROUTING_TIMEOUT_MS };
