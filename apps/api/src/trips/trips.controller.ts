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
  Query,
  UseGuards,
} from "@nestjs/common";
import type { Trip, TripParticipant, TripsPage } from "@tripforge/contracts";

import type { AuthenticatedUser } from "../auth/auth.types";
import { BrowserMutationGuard } from "../auth/browser/browser-mutation.guard";
import { RequireJsonBody } from "../auth/browser/require-json-body.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { SessionAuthGuard } from "../auth/guards/session-auth.guard";
import { AddTripMemberDto } from "./dto/add-trip-member.dto";
import { CreateTripDto } from "./dto/create-trip.dto";
import { ListTripsQueryDto } from "./dto/list-trips-query.dto";
import { UpdateTripDto } from "./dto/update-trip.dto";
import { UpdateTripMemberDto } from "./dto/update-trip-member.dto";
import { TripsService } from "./trips.service";

@Controller("trips")
@UseGuards(SessionAuthGuard, BrowserMutationGuard)
export class TripsController {
  constructor(private readonly tripsService: TripsService) {}

  @Post()
  @RequireJsonBody()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() input: CreateTripDto,
  ): Promise<Trip> {
    return this.tripsService.create(user.id, input);
  }

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListTripsQueryDto,
  ): Promise<TripsPage> {
    return this.tripsService.list(user.id, query.page, query.pageSize);
  }

  @Get(":tripId")
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param("tripId", ParseUUIDPipe) tripId: string,
  ): Promise<Trip> {
    return this.tripsService.get(user.id, tripId);
  }

  @Patch(":tripId")
  @RequireJsonBody()
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("tripId", ParseUUIDPipe) tripId: string,
    @Body() input: UpdateTripDto,
  ): Promise<Trip> {
    return this.tripsService.update(user.id, tripId, input);
  }

  @Delete(":tripId")
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(
    @CurrentUser() user: AuthenticatedUser,
    @Param("tripId", ParseUUIDPipe) tripId: string,
  ): Promise<void> {
    return this.tripsService.delete(user.id, tripId);
  }

  @Get(":tripId/members")
  listMembers(
    @CurrentUser() user: AuthenticatedUser,
    @Param("tripId", ParseUUIDPipe) tripId: string,
  ): Promise<TripParticipant[]> {
    return this.tripsService.listParticipants(user.id, tripId);
  }

  @Post(":tripId/members")
  @RequireJsonBody()
  addMember(
    @CurrentUser() user: AuthenticatedUser,
    @Param("tripId", ParseUUIDPipe) tripId: string,
    @Body() input: AddTripMemberDto,
  ): Promise<TripParticipant> {
    return this.tripsService.addMember(user.id, tripId, input);
  }

  @Patch(":tripId/members/:userId")
  @RequireJsonBody()
  updateMemberRole(
    @CurrentUser() user: AuthenticatedUser,
    @Param("tripId", ParseUUIDPipe) tripId: string,
    @Param("userId", ParseUUIDPipe) memberUserId: string,
    @Body() input: UpdateTripMemberDto,
  ): Promise<TripParticipant> {
    return this.tripsService.updateMemberRole(
      user.id,
      tripId,
      memberUserId,
      input.role,
    );
  }

  @Delete(":tripId/members/:userId")
  @HttpCode(HttpStatus.NO_CONTENT)
  removeMember(
    @CurrentUser() user: AuthenticatedUser,
    @Param("tripId", ParseUUIDPipe) tripId: string,
    @Param("userId", ParseUUIDPipe) memberUserId: string,
  ): Promise<void> {
    return this.tripsService.removeMember(user.id, tripId, memberUserId);
  }
}
