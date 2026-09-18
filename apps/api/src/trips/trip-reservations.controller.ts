import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import type { TripReservation } from "@tripforge/contracts";

import type { AuthenticatedUser } from "../auth/auth.types";
import { BrowserMutationGuard } from "../auth/browser/browser-mutation.guard";
import { RequireJsonBody } from "../auth/browser/require-json-body.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { SessionAuthGuard } from "../auth/guards/session-auth.guard";
import { CreateTripReservationDto } from "./dto/create-trip-reservation.dto";
import { UpdateTripReservationDto } from "./dto/update-trip-reservation.dto";
import { TripReservationsService } from "./trip-reservations.service";

@Controller("trips/:tripId/reservations")
@UseGuards(SessionAuthGuard, BrowserMutationGuard)
export class TripReservationsController {
  constructor(private readonly reservations: TripReservationsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param("tripId", ParseUUIDPipe) tripId: string,
  ): Promise<TripReservation[]> {
    return this.reservations.list(user.id, tripId);
  }

  @Post()
  @RequireJsonBody()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param("tripId", ParseUUIDPipe) tripId: string,
    @Body() input: CreateTripReservationDto,
  ): Promise<TripReservation> {
    return this.reservations.create(user.id, tripId, input);
  }

  @Get(":reservationId")
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param("tripId", ParseUUIDPipe) tripId: string,
    @Param("reservationId", ParseUUIDPipe) reservationId: string,
  ): Promise<TripReservation> {
    return this.reservations.get(user.id, tripId, reservationId);
  }

  @Patch(":reservationId")
  @RequireJsonBody()
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("tripId", ParseUUIDPipe) tripId: string,
    @Param("reservationId", ParseUUIDPipe) reservationId: string,
    @Body() input: UpdateTripReservationDto,
  ): Promise<TripReservation> {
    return this.reservations.update(user.id, tripId, reservationId, input);
  }

  @Delete(":reservationId")
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(
    @CurrentUser() user: AuthenticatedUser,
    @Param("tripId", ParseUUIDPipe) tripId: string,
    @Param("reservationId", ParseUUIDPipe) reservationId: string,
  ): Promise<void> {
    return this.reservations.delete(user.id, tripId, reservationId);
  }
}
