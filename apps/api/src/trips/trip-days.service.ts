import { HttpException, HttpStatus, Injectable } from "@nestjs/common";
import type { TripDay } from "@tripforge/contracts";

import { TripRealtimePublisher } from "../realtime/trip-realtime.publisher";
import { TripDaysRepository } from "./trip-days.repository";
import { TripDestinationsRepository } from "./trip-destinations.repository";
import { TripPermissionsService } from "./trip-permissions.service";

@Injectable()
export class TripDaysService {
  constructor(
    private readonly daysRepository: TripDaysRepository,
    private readonly destinationsRepository: TripDestinationsRepository,
    private readonly permissions: TripPermissionsService,
    private readonly realtime: TripRealtimePublisher,
  ) {}

  async list(userId: string, tripId: string): Promise<TripDay[]> {
    await this.permissions.requireReadable(userId, tripId);
    return this.daysRepository.list(tripId);
  }

  async updateDestination(
    userId: string,
    tripId: string,
    dayId: string,
    destinationId: string | null,
  ): Promise<TripDay> {
    await this.permissions.requireEditable(userId, tripId);

    if (
      destinationId !== null &&
      !(await this.destinationsRepository.exists(tripId, destinationId))
    ) {
      throw new HttpException(
        { code: "DESTINATION_NOT_FOUND", message: "Destination not found" },
        HttpStatus.NOT_FOUND,
      );
    }

    const day = await this.daysRepository.updateDestination(
      tripId,
      dayId,
      destinationId,
    );

    if (!day) {
      throw new HttpException(
        { code: "TRIP_DAY_NOT_FOUND", message: "Trip day not found" },
        HttpStatus.NOT_FOUND,
      );
    }

    this.realtime.invalidate(tripId, ["days"]);
    return day;
  }
}
