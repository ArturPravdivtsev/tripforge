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
import type { TripDestination } from "@tripforge/contracts";

import type { AuthenticatedUser } from "../auth/auth.types";
import { BrowserMutationGuard } from "../auth/browser/browser-mutation.guard";
import { RequireJsonBody } from "../auth/browser/require-json-body.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { SessionAuthGuard } from "../auth/guards/session-auth.guard";
import { CreateTripDestinationDto } from "./dto/create-trip-destination.dto";
import { ReorderTripDestinationsDto } from "./dto/reorder-trip-destinations.dto";
import { UpdateTripDestinationDto } from "./dto/update-trip-destination.dto";
import { TripDestinationsService } from "./trip-destinations.service";

@Controller("trips/:tripId/destinations")
@UseGuards(SessionAuthGuard, BrowserMutationGuard)
export class TripDestinationsController {
  constructor(private readonly destinations: TripDestinationsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param("tripId", ParseUUIDPipe) tripId: string,
  ): Promise<TripDestination[]> {
    return this.destinations.list(user.id, tripId);
  }

  @Post()
  @RequireJsonBody()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param("tripId", ParseUUIDPipe) tripId: string,
    @Body() input: CreateTripDestinationDto,
  ): Promise<TripDestination> {
    return this.destinations.create(user.id, tripId, input.name);
  }

  @Patch("reorder")
  @RequireJsonBody()
  reorder(
    @CurrentUser() user: AuthenticatedUser,
    @Param("tripId", ParseUUIDPipe) tripId: string,
    @Body() input: ReorderTripDestinationsDto,
  ): Promise<TripDestination[]> {
    return this.destinations.reorder(user.id, tripId, input.destinationIds);
  }

  @Patch(":destinationId")
  @RequireJsonBody()
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("tripId", ParseUUIDPipe) tripId: string,
    @Param("destinationId", ParseUUIDPipe) destinationId: string,
    @Body() input: UpdateTripDestinationDto,
  ): Promise<TripDestination> {
    return this.destinations.update(user.id, tripId, destinationId, input);
  }

  @Delete(":destinationId")
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(
    @CurrentUser() user: AuthenticatedUser,
    @Param("tripId", ParseUUIDPipe) tripId: string,
    @Param("destinationId", ParseUUIDPipe) destinationId: string,
  ): Promise<void> {
    return this.destinations.delete(user.id, tripId, destinationId);
  }
}
