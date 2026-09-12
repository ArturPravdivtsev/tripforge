import { HttpException, HttpStatus, Injectable } from "@nestjs/common";
import type {
  CreateTripRequest,
  Trip,
  TripsPage,
  UpdateTripRequest,
} from "@tripforge/contracts";

import { TripsRepository } from "./trips.repository";

@Injectable()
export class TripsService {
  constructor(private readonly tripsRepository: TripsRepository) {}

  async create(ownerId: string, input: CreateTripRequest): Promise<Trip> {
    const normalized = {
      endsOn: input.endsOn ?? null,
      name: input.name.trim(),
      startsOn: input.startsOn ?? null,
    };

    this.assertDateRange(normalized.startsOn, normalized.endsOn);

    return this.tripsRepository.create(ownerId, normalized);
  }

  async list(
    ownerId: string,
    page: number,
    pageSize: number,
  ): Promise<TripsPage> {
    const result = await this.tripsRepository.listOwned(ownerId, page, pageSize);

    return {
      ...result,
      page,
      pageSize,
      totalPages: result.total === 0 ? 0 : Math.ceil(result.total / pageSize),
    };
  }

  async get(ownerId: string, tripId: string): Promise<Trip> {
    const trip = await this.tripsRepository.findOwnedById(ownerId, tripId);

    if (!trip) {
      throw this.notFound();
    }

    return trip;
  }

  async update(
    ownerId: string,
    tripId: string,
    input: UpdateTripRequest,
  ): Promise<Trip> {
    const hasName = input.name !== undefined;
    const hasStartsOn = input.startsOn !== undefined;
    const hasEndsOn = input.endsOn !== undefined;

    if (!hasName && !hasStartsOn && !hasEndsOn) {
      throw new HttpException(
        {
          code: "EMPTY_TRIP_UPDATE",
          message: "Provide at least one field to update",
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const current = await this.get(ownerId, tripId);
    const update: UpdateTripRequest = {};

    if (hasName) {
      update.name = input.name?.trim();
    }

    if (hasStartsOn) {
      update.startsOn = input.startsOn ?? null;
    }

    if (hasEndsOn) {
      update.endsOn = input.endsOn ?? null;
    }

    this.assertDateRange(
      hasStartsOn ? (update.startsOn ?? null) : current.startsOn,
      hasEndsOn ? (update.endsOn ?? null) : current.endsOn,
    );

    const updated = await this.tripsRepository.updateOwned(
      ownerId,
      tripId,
      update,
    );

    if (!updated) {
      throw this.notFound();
    }

    return updated;
  }

  async delete(ownerId: string, tripId: string): Promise<void> {
    const deleted = await this.tripsRepository.deleteOwned(ownerId, tripId);

    if (!deleted) {
      throw this.notFound();
    }
  }

  private assertDateRange(
    startsOn: string | null,
    endsOn: string | null,
  ): void {
    if (startsOn && endsOn && endsOn < startsOn) {
      throw new HttpException(
        {
          code: "INVALID_TRIP_DATE_RANGE",
          message: "Trip end date cannot be before its start date",
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  private notFound(): HttpException {
    return new HttpException(
      { code: "TRIP_NOT_FOUND", message: "Trip not found" },
      HttpStatus.NOT_FOUND,
    );
  }
}
