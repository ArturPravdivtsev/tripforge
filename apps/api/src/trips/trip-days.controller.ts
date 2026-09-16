import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  UseGuards,
} from "@nestjs/common";
import type { TripDay } from "@tripforge/contracts";

import type { AuthenticatedUser } from "../auth/auth.types";
import { BrowserMutationGuard } from "../auth/browser/browser-mutation.guard";
import { RequireJsonBody } from "../auth/browser/require-json-body.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { SessionAuthGuard } from "../auth/guards/session-auth.guard";
import { UpdateTripDayDto } from "./dto/update-trip-day.dto";
import { TripDaysService } from "./trip-days.service";

@Controller("trips/:tripId/days")
@UseGuards(SessionAuthGuard, BrowserMutationGuard)
export class TripDaysController {
  constructor(private readonly days: TripDaysService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param("tripId", ParseUUIDPipe) tripId: string,
  ): Promise<TripDay[]> {
    return this.days.list(user.id, tripId);
  }

  @Patch(":dayId")
  @RequireJsonBody()
  updateDestination(
    @CurrentUser() user: AuthenticatedUser,
    @Param("tripId", ParseUUIDPipe) tripId: string,
    @Param("dayId", ParseUUIDPipe) dayId: string,
    @Body() input: UpdateTripDayDto,
  ): Promise<TripDay> {
    return this.days.updateDestination(
      user.id,
      tripId,
      dayId,
      input.destinationId,
    );
  }
}
