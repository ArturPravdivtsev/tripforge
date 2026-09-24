import { HttpException, HttpStatus, Injectable } from "@nestjs/common";
import type {
  TripDestination,
  UpdateTripDestinationRequest,
} from "@tripforge/contracts";

import { TripRealtimePublisher } from "../realtime/trip-realtime.publisher";
import {
  DestinationOrderChangedError,
  TripDestinationsRepository,
} from "./trip-destinations.repository";
import { TripPermissionsService } from "./trip-permissions.service";

export function isCompleteDestinationOrder(
  currentIds: readonly string[],
  desiredIds: readonly string[],
): boolean {
  if (currentIds.length !== desiredIds.length) {
    return false;
  }

  return (
    new Set(desiredIds).size === desiredIds.length &&
    desiredIds.every((id) => currentIds.includes(id))
  );
}

export function isValidDestinationCoordinateUpdate(
  input: UpdateTripDestinationRequest,
): boolean {
  const hasLatitude = input.latitude !== undefined;
  const hasLongitude = input.longitude !== undefined;

  if (hasLatitude !== hasLongitude) return false;
  if (!hasLatitude) return true;

  const { latitude, longitude } = input;
  if (latitude === null || longitude === null) {
    return latitude === null && longitude === null;
  }

  return (
    typeof latitude === "number" &&
    Number.isFinite(latitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    typeof longitude === "number" &&
    Number.isFinite(longitude) &&
    longitude >= -180 &&
    longitude <= 180
  );
}

@Injectable()
export class TripDestinationsService {
  constructor(
    private readonly destinationsRepository: TripDestinationsRepository,
    private readonly permissions: TripPermissionsService,
    private readonly realtime: TripRealtimePublisher,
  ) {}

  async list(userId: string, tripId: string): Promise<TripDestination[]> {
    await this.permissions.requireReadable(userId, tripId);
    return this.destinationsRepository.list(tripId);
  }

  async create(
    userId: string,
    tripId: string,
    name: string,
  ): Promise<TripDestination> {
    await this.permissions.requireEditable(userId, tripId);
    const destination = await this.destinationsRepository.create(
      tripId,
      name.trim(),
    );
    this.realtime.invalidate(tripId, ["destinations"]);
    return destination;
  }

  async update(
    userId: string,
    tripId: string,
    destinationId: string,
    input: UpdateTripDestinationRequest,
  ): Promise<TripDestination> {
    await this.permissions.requireEditable(userId, tripId);

    if (!isValidDestinationCoordinateUpdate(input)) {
      throw this.invalidCoordinates();
    }

    const changes: UpdateTripDestinationRequest = {};
    if (input.name !== undefined) changes.name = input.name.trim();
    if (input.latitude !== undefined) changes.latitude = input.latitude;
    if (input.longitude !== undefined) changes.longitude = input.longitude;
    const destination = await this.destinationsRepository.update(
      tripId,
      destinationId,
      changes,
    );

    if (!destination) {
      throw this.notFound();
    }

    this.realtime.invalidate(tripId, ["destinations"]);
    return destination;
  }

  async delete(
    userId: string,
    tripId: string,
    destinationId: string,
  ): Promise<void> {
    await this.permissions.requireEditable(userId, tripId);

    if (!(await this.destinationsRepository.delete(tripId, destinationId))) {
      throw this.notFound();
    }
    this.realtime.invalidate(tripId, ["destinations", "days"]);
  }

  async reorder(
    userId: string,
    tripId: string,
    destinationIds: readonly string[],
  ): Promise<TripDestination[]> {
    await this.permissions.requireEditable(userId, tripId);
    const current = await this.destinationsRepository.list(tripId);

    if (
      !isCompleteDestinationOrder(
        current.map(({ id }) => id),
        destinationIds,
      )
    ) {
      throw this.invalidOrder();
    }

    try {
      await this.destinationsRepository.reorder(tripId, destinationIds);
    } catch (error) {
      if (error instanceof DestinationOrderChangedError) {
        throw this.invalidOrder();
      }
      throw error;
    }

    const destinations = await this.destinationsRepository.list(tripId);
    this.realtime.invalidate(tripId, ["destinations"]);
    return destinations;
  }

  private invalidOrder(): HttpException {
    return new HttpException(
      {
        code: "INVALID_DESTINATION_ORDER",
        message: "Destination order must include every destination exactly once",
      },
      HttpStatus.BAD_REQUEST,
    );
  }

  private invalidCoordinates(): HttpException {
    return new HttpException(
      {
        code: "INVALID_DESTINATION_COORDINATES",
        message: "Latitude and longitude must be supplied as a valid pair",
      },
      HttpStatus.BAD_REQUEST,
    );
  }

  private notFound(): HttpException {
    return new HttpException(
      { code: "DESTINATION_NOT_FOUND", message: "Destination not found" },
      HttpStatus.NOT_FOUND,
    );
  }
}
