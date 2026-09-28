import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from "@nestjs/common";
import type { TripSearchResponse } from "@tripforge/contracts";

import type { AuthenticatedUser } from "../auth/auth.types";
import { BrowserMutationGuard } from "../auth/browser/browser-mutation.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { SessionAuthGuard } from "../auth/guards/session-auth.guard";
import { SearchTripQueryDto } from "./dto/search-trip-query.dto";
import { TripSearchService } from "./trip-search.service";

@Controller("trips/:tripId/search")
@UseGuards(SessionAuthGuard, BrowserMutationGuard)
export class TripSearchController {
  constructor(private readonly search: TripSearchService) {}

  @Get()
  find(
    @CurrentUser() user: AuthenticatedUser,
    @Param("tripId", ParseUUIDPipe) tripId: string,
    @Query() query: SearchTripQueryDto,
  ): Promise<TripSearchResponse> {
    return this.search.search(user.id, tripId, query);
  }
}
