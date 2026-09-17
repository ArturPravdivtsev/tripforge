import { HttpException, HttpStatus, Injectable } from "@nestjs/common";
import type {
  CreateItineraryItemRequest,
  ItineraryItem,
  ReorderItineraryItemsRequest,
  UpdateItineraryItemRequest,
} from "@tripforge/contracts";

import {
  InvalidItineraryOrderError,
  ItineraryItemsRepository,
} from "./itinerary-items.repository";
import { TripPermissionsService } from "./trip-permissions.service";

export function normalizeItineraryNotes(value: string | null | undefined) {
  if (value === undefined || value === null) return value ?? null;
  return value.trim() || null;
}

export function hasValidItineraryOrderStructure(
  days: ReorderItineraryItemsRequest["days"],
): boolean {
  if (days.length === 0) return false;

  const dayIds = days.map(({ dayId }) => dayId);
  const itemIds = days.flatMap(({ itemIds }) => itemIds);

  return (
    new Set(dayIds).size === dayIds.length &&
    new Set(itemIds).size === itemIds.length
  );
}

@Injectable()
export class ItineraryItemsService {
  constructor(
    private readonly itemsRepository: ItineraryItemsRepository,
    private readonly permissions: TripPermissionsService,
  ) {}

  async list(userId: string, tripId: string): Promise<ItineraryItem[]> {
    await this.permissions.requireReadable(userId, tripId);
    return this.itemsRepository.list(tripId);
  }

  async create(
    userId: string,
    tripId: string,
    input: CreateItineraryItemRequest,
  ): Promise<ItineraryItem> {
    await this.permissions.requireEditable(userId, tripId);
    const item = await this.itemsRepository.create(tripId, {
      dayId: input.dayId,
      kind: input.kind,
      notes: normalizeItineraryNotes(input.notes),
      startTime: input.startTime ?? null,
      title: input.title.trim(),
    });

    if (!item) throw this.dayNotFound();
    return item;
  }

  async update(
    userId: string,
    tripId: string,
    itemId: string,
    input: UpdateItineraryItemRequest,
  ): Promise<ItineraryItem> {
    await this.permissions.requireEditable(userId, tripId);

    if (!Object.values(input).some((value) => value !== undefined)) {
      throw new HttpException(
        {
          code: "EMPTY_ITINERARY_ITEM_UPDATE",
          message: "Provide at least one itinerary item field to update",
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const update: UpdateItineraryItemRequest = {};
    if (input.kind !== undefined) update.kind = input.kind;
    if (input.title !== undefined) update.title = input.title.trim();
    if (input.startTime !== undefined) update.startTime = input.startTime;
    if (input.notes !== undefined) update.notes = normalizeItineraryNotes(input.notes);

    const item = await this.itemsRepository.update(tripId, itemId, update);
    if (!item) throw this.itemNotFound();
    return item;
  }

  async delete(userId: string, tripId: string, itemId: string): Promise<void> {
    await this.permissions.requireEditable(userId, tripId);
    if (!(await this.itemsRepository.delete(tripId, itemId))) {
      throw this.itemNotFound();
    }
  }

  async reorder(
    userId: string,
    tripId: string,
    input: ReorderItineraryItemsRequest,
  ): Promise<ItineraryItem[]> {
    await this.permissions.requireEditable(userId, tripId);
    if (!hasValidItineraryOrderStructure(input.days)) {
      throw this.invalidOrder();
    }

    try {
      return await this.itemsRepository.reorder(tripId, input.days);
    } catch (error) {
      if (error instanceof InvalidItineraryOrderError) throw this.invalidOrder();
      throw error;
    }
  }

  private dayNotFound(): HttpException {
    return new HttpException(
      { code: "TRIP_DAY_NOT_FOUND", message: "Trip day not found" },
      HttpStatus.NOT_FOUND,
    );
  }

  private invalidOrder(): HttpException {
    return new HttpException(
      {
        code: "INVALID_ITINERARY_ORDER",
        message: "Itinerary order must include every item in the affected days",
      },
      HttpStatus.BAD_REQUEST,
    );
  }

  private itemNotFound(): HttpException {
    return new HttpException(
      { code: "ITINERARY_ITEM_NOT_FOUND", message: "Itinerary item not found" },
      HttpStatus.NOT_FOUND,
    );
  }
}
