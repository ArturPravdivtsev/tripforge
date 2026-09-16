import { HttpException, HttpStatus, Injectable } from "@nestjs/common";

import { TripsRepository, type TripAccess } from "./trips.repository";

@Injectable()
export class TripPermissionsService {
  constructor(private readonly tripsRepository: TripsRepository) {}

  async requireReadable(userId: string, tripId: string): Promise<TripAccess> {
    const access = await this.tripsRepository.findAccess(userId, tripId);

    if (!access) {
      throw new HttpException(
        { code: "TRIP_NOT_FOUND", message: "Trip not found" },
        HttpStatus.NOT_FOUND,
      );
    }

    return access;
  }

  async requireEditable(userId: string, tripId: string): Promise<TripAccess> {
    const access = await this.requireReadable(userId, tripId);

    if (access.role === "viewer") {
      throw new HttpException(
        {
          code: "INSUFFICIENT_TRIP_PERMISSION",
          message: "Your Trip role does not allow this action",
        },
        HttpStatus.FORBIDDEN,
      );
    }

    return access;
  }
}
