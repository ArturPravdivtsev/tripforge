import { HttpException, HttpStatus, Injectable } from "@nestjs/common";
import type {
  CreateTripRouteRequest,
  TripRouteSegment,
  UpdateTripRouteRequest,
} from "@tripforge/contracts";

import {
  OpenRouteServiceClient,
  RoutingProviderError,
} from "../routing/openrouteservice.client";
import { TripPermissionsService } from "./trip-permissions.service";
import {
  RouteAlreadyExistsError,
  RouteEndpointChangedError,
  RouteNotFoundError,
  TripRoutesRepository,
  type RouteEndpointSnapshot,
} from "./trip-routes.repository";

@Injectable()
export class TripRoutesService {
  constructor(
    private readonly routes: TripRoutesRepository,
    private readonly permissions: TripPermissionsService,
    private readonly provider: OpenRouteServiceClient,
  ) {}

  async list(userId: string, tripId: string): Promise<TripRouteSegment[]> {
    await this.permissions.requireReadable(userId, tripId);
    return this.routes.list(tripId);
  }

  async create(
    userId: string,
    tripId: string,
    input: CreateTripRouteRequest,
  ): Promise<TripRouteSegment> {
    await this.permissions.requireEditable(userId, tripId);
    if (input.fromItemId === input.toItemId) {
      throw routeError(
        "ROUTE_ENDPOINTS_MUST_DIFFER",
        "Route endpoints must be different",
        HttpStatus.BAD_REQUEST,
      );
    }
    if (
      await this.routes.pairExists(
        tripId,
        input.fromItemId,
        input.toItemId,
      )
    ) {
      throw routeAlreadyExists();
    }

    const [from, to] = await this.loadEndpoints(
      tripId,
      input.fromItemId,
      input.toItemId,
    );
    const calculated = await this.calculate(input.mode, from, to);

    try {
      return await this.routes.create(tripId, from, to, input.mode, calculated);
    } catch (error) {
      if (error instanceof RouteAlreadyExistsError) throw routeAlreadyExists();
      if (error instanceof RouteEndpointChangedError) throw endpointChanged();
      throw error;
    }
  }

  async update(
    userId: string,
    tripId: string,
    routeId: string,
    input: UpdateTripRouteRequest,
  ): Promise<TripRouteSegment> {
    await this.permissions.requireEditable(userId, tripId);
    const existing = await this.routes.find(tripId, routeId);
    if (!existing) throw routeNotFound();

    const [from, to] = await this.loadEndpoints(
      tripId,
      existing.fromItemId,
      existing.toItemId,
    );
    const calculated = await this.calculate(input.mode, from, to);

    try {
      return await this.routes.update(
        tripId,
        routeId,
        from,
        to,
        input.mode,
        calculated,
      );
    } catch (error) {
      if (error instanceof RouteEndpointChangedError) throw endpointChanged();
      if (error instanceof RouteNotFoundError) throw routeNotFound();
      throw error;
    }
  }

  async delete(userId: string, tripId: string, routeId: string): Promise<void> {
    await this.permissions.requireEditable(userId, tripId);
    if (!(await this.routes.delete(tripId, routeId))) throw routeNotFound();
  }

  private async loadEndpoints(
    tripId: string,
    fromItemId: string,
    toItemId: string,
  ): Promise<[RouteEndpointSnapshot, RouteEndpointSnapshot]> {
    const endpoints = await this.routes.getEndpoints(tripId, [
      fromItemId,
      toItemId,
    ]);
    const from = endpoints.find(({ itemId }) => itemId === fromItemId);
    const to = endpoints.find(({ itemId }) => itemId === toItemId);
    if (!from || !to) {
      throw routeError(
        "ROUTE_ENDPOINT_NOT_FOUND",
        "Route endpoint not found",
        HttpStatus.NOT_FOUND,
      );
    }
    if (
      from.latitude === null ||
      from.longitude === null ||
      to.latitude === null ||
      to.longitude === null
    ) {
      throw routeError(
        "ROUTE_ENDPOINT_HAS_NO_LOCATION",
        "Both route endpoints must have locations",
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    return [
      { itemId: from.itemId, latitude: from.latitude, longitude: from.longitude },
      { itemId: to.itemId, latitude: to.latitude, longitude: to.longitude },
    ];
  }

  private async calculate(
    mode: CreateTripRouteRequest["mode"],
    from: RouteEndpointSnapshot,
    to: RouteEndpointSnapshot,
  ) {
    try {
      return await this.provider.calculate(mode, from, to);
    } catch (error) {
      if (!(error instanceof RoutingProviderError)) throw error;
      if (error.code === "rate-limited") {
        throw routeError(
          "ROUTING_PROVIDER_RATE_LIMITED",
          "Routing provider is temporarily rate limited",
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }
      if (error.code === "not-found") {
        throw routeError(
          "ROUTE_NOT_FOUND",
          "No route was found for these endpoints",
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      }
      if (error.code === "invalid-response") {
        throw routeError(
          "INVALID_ROUTING_RESPONSE",
          "Routing provider returned an invalid response",
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }
      throw routeError(
        "ROUTING_PROVIDER_UNAVAILABLE",
        "Routing provider is temporarily unavailable",
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }
}

function routeError(code: string, message: string, status: HttpStatus) {
  return new HttpException({ code, message }, status);
}

function routeAlreadyExists() {
  return routeError(
    "ROUTE_ALREADY_EXISTS",
    "A route already exists for this directional pair",
    HttpStatus.CONFLICT,
  );
}

function endpointChanged() {
  return routeError(
    "ROUTE_ENDPOINT_CHANGED",
    "A route endpoint changed while the route was calculating",
    HttpStatus.CONFLICT,
  );
}

function routeNotFound() {
  return routeError("ROUTE_NOT_FOUND", "Route not found", HttpStatus.NOT_FOUND);
}
