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
import type { ItineraryItem } from "@tripforge/contracts";

import type { AuthenticatedUser } from "../auth/auth.types";
import { BrowserMutationGuard } from "../auth/browser/browser-mutation.guard";
import { RequireJsonBody } from "../auth/browser/require-json-body.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { SessionAuthGuard } from "../auth/guards/session-auth.guard";
import { CreateItineraryItemDto } from "./dto/create-itinerary-item.dto";
import { ReorderItineraryItemsDto } from "./dto/reorder-itinerary-items.dto";
import { UpdateItineraryItemDto } from "./dto/update-itinerary-item.dto";
import { ItineraryItemsService } from "./itinerary-items.service";

@Controller("trips/:tripId/itinerary-items")
@UseGuards(SessionAuthGuard, BrowserMutationGuard)
export class ItineraryItemsController {
  constructor(private readonly items: ItineraryItemsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param("tripId", ParseUUIDPipe) tripId: string,
  ): Promise<ItineraryItem[]> {
    return this.items.list(user.id, tripId);
  }

  @Post()
  @RequireJsonBody()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param("tripId", ParseUUIDPipe) tripId: string,
    @Body() input: CreateItineraryItemDto,
  ): Promise<ItineraryItem> {
    return this.items.create(user.id, tripId, input);
  }

  @Patch("reorder")
  @RequireJsonBody()
  reorder(
    @CurrentUser() user: AuthenticatedUser,
    @Param("tripId", ParseUUIDPipe) tripId: string,
    @Body() input: ReorderItineraryItemsDto,
  ): Promise<ItineraryItem[]> {
    return this.items.reorder(user.id, tripId, input);
  }

  @Patch(":itemId")
  @RequireJsonBody()
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("tripId", ParseUUIDPipe) tripId: string,
    @Param("itemId", ParseUUIDPipe) itemId: string,
    @Body() input: UpdateItineraryItemDto,
  ): Promise<ItineraryItem> {
    return this.items.update(user.id, tripId, itemId, input);
  }

  @Delete(":itemId")
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(
    @CurrentUser() user: AuthenticatedUser,
    @Param("tripId", ParseUUIDPipe) tripId: string,
    @Param("itemId", ParseUUIDPipe) itemId: string,
  ): Promise<void> {
    return this.items.delete(user.id, tripId, itemId);
  }
}
