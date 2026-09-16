import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { DatabaseModule } from "../database/database.module";
import { TripDaysController } from "./trip-days.controller";
import { TripDaysRepository } from "./trip-days.repository";
import { TripDaysService } from "./trip-days.service";
import { TripDestinationsController } from "./trip-destinations.controller";
import { TripDestinationsRepository } from "./trip-destinations.repository";
import { TripDestinationsService } from "./trip-destinations.service";
import { TripPermissionsService } from "./trip-permissions.service";
import { TripsController } from "./trips.controller";
import { TripsRepository } from "./trips.repository";
import { TripsService } from "./trips.service";

@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [
    TripsController,
    TripDestinationsController,
    TripDaysController,
  ],
  providers: [
    TripsRepository,
    TripsService,
    TripPermissionsService,
    TripDestinationsRepository,
    TripDestinationsService,
    TripDaysRepository,
    TripDaysService,
  ],
})
export class TripsModule {}
