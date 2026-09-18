import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { DatabaseModule } from "../database/database.module";
import { OpenRouteServiceClient } from "../routing/openrouteservice.client";
import { ItineraryItemsController } from "./itinerary-items.controller";
import { ItineraryItemsRepository } from "./itinerary-items.repository";
import { ItineraryItemsService } from "./itinerary-items.service";
import { TripDaysController } from "./trip-days.controller";
import { TripDaysRepository } from "./trip-days.repository";
import { TripDaysService } from "./trip-days.service";
import { TripDestinationsController } from "./trip-destinations.controller";
import { TripDestinationsRepository } from "./trip-destinations.repository";
import { TripDestinationsService } from "./trip-destinations.service";
import { TripPermissionsService } from "./trip-permissions.service";
import { TripRoutesController } from "./trip-routes.controller";
import { TripRoutesRepository } from "./trip-routes.repository";
import { TripRoutesService } from "./trip-routes.service";
import { TripReservationsController } from "./trip-reservations.controller";
import { TripReservationsRepository } from "./trip-reservations.repository";
import { TripReservationsService } from "./trip-reservations.service";
import { TripsController } from "./trips.controller";
import { TripsRepository } from "./trips.repository";
import { TripsService } from "./trips.service";

@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [
    TripsController,
    TripDestinationsController,
    TripDaysController,
    ItineraryItemsController,
    TripRoutesController,
    TripReservationsController,
  ],
  providers: [
    TripsRepository,
    TripsService,
    TripPermissionsService,
    TripDestinationsRepository,
    TripDestinationsService,
    TripDaysRepository,
    TripDaysService,
    ItineraryItemsRepository,
    ItineraryItemsService,
    TripRoutesRepository,
    TripRoutesService,
    TripReservationsRepository,
    TripReservationsService,
    OpenRouteServiceClient,
  ],
})
export class TripsModule {}
