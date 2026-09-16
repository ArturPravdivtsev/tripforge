import { HttpException, HttpStatus, Injectable } from "@nestjs/common";
import type { TripDestination } from "@tripforge/contracts";

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

@Injectable()
export class TripDestinationsService {
  constructor(
    private readonly destinationsRepository: TripDestinationsRepository,
    private readonly permissions: TripPermissionsService,
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
    return this.destinationsRepository.create(tripId, name.trim());
  }

  async update(
    userId: string,
    tripId: string,
    destinationId: string,
    name: string,
  ): Promise<TripDestination> {
    await this.permissions.requireEditable(userId, tripId);
    const destination = await this.destinationsRepository.update(
      tripId,
      destinationId,
      name.trim(),
    );

    if (!destination) {
      throw this.notFound();
    }

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

    return this.destinationsRepository.list(tripId);
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

  private notFound(): HttpException {
    return new HttpException(
      { code: "DESTINATION_NOT_FOUND", message: "Destination not found" },
      HttpStatus.NOT_FOUND,
    );
  }
}
