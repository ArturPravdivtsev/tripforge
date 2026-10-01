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
import type { TripRouteSegment } from "@tripforge/contracts";

import type { AuthenticatedUser } from "../auth/auth.types";
import { BrowserMutationGuard } from "../auth/browser/browser-mutation.guard";
import { RequireJsonBody } from "../auth/browser/require-json-body.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { SessionAuthGuard } from "../auth/guards/session-auth.guard";
import { SecurityRateLimit } from "../security/security-rate-limit.decorator";
import { SecurityRateLimitGuard } from "../security/security-rate-limit.guard";
import { CreateTripRouteDto } from "./dto/create-trip-route.dto";
import { UpdateTripRouteDto } from "./dto/update-trip-route.dto";
import { TripRoutesService } from "./trip-routes.service";

@Controller("trips/:tripId/routes")
@UseGuards(SessionAuthGuard, BrowserMutationGuard, SecurityRateLimitGuard)
export class TripRoutesController {
  constructor(private readonly routes: TripRoutesService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param("tripId", ParseUUIDPipe) tripId: string,
  ): Promise<TripRouteSegment[]> {
    return this.routes.list(user.id, tripId);
  }

  @Post()
  @RequireJsonBody()
  @SecurityRateLimit("routeCalculation")
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param("tripId", ParseUUIDPipe) tripId: string,
    @Body() input: CreateTripRouteDto,
  ): Promise<TripRouteSegment> {
    return this.routes.create(user.id, tripId, input);
  }

  @Patch(":routeId")
  @RequireJsonBody()
  @SecurityRateLimit("routeCalculation")
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("tripId", ParseUUIDPipe) tripId: string,
    @Param("routeId", ParseUUIDPipe) routeId: string,
    @Body() input: UpdateTripRouteDto,
  ): Promise<TripRouteSegment> {
    return this.routes.update(user.id, tripId, routeId, input);
  }

  @Delete(":routeId")
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(
    @CurrentUser() user: AuthenticatedUser,
    @Param("tripId", ParseUUIDPipe) tripId: string,
    @Param("routeId", ParseUUIDPipe) routeId: string,
  ): Promise<void> {
    return this.routes.delete(user.id, tripId, routeId);
  }
}
