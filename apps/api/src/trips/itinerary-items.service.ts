import { HttpException, HttpStatus, Injectable } from "@nestjs/common";
import type {
  CreateItineraryItemRequest,
  ItineraryItem,
  ItineraryPlaceInput,
  ReorderItineraryItemsRequest,
  UpdateItineraryItemRequest,
} from "@tripforge/contracts";

import type { DatabaseTransaction } from "../database/database.provider";
import { TripRealtimePublisher } from "../realtime/trip-realtime.publisher";
import {
  InvalidItineraryOrderError,
  ItineraryItemsRepository,
} from "./itinerary-items.repository";
import { TripPermissionsService } from "./trip-permissions.service";

export function normalizeItineraryNotes(value: string | null | undefined) {
  if (value === undefined || value === null) return value ?? null;
  return value.trim() || null;
}

export function normalizeItineraryPlace(
  place: ItineraryPlaceInput | null | undefined,
): ItineraryPlaceInput | null | undefined {
  if (place === undefined || place === null) return place;

  return {
    address: place.address?.trim() || null,
    latitude: place.latitude,
    longitude: place.longitude,
    name: place.name.trim(),
    provider: place.provider,
    providerReference: place.providerReference?.trim() || null,
  };
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
    private readonly realtime: TripRealtimePublisher,
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
    const item = await this.itemsRepository.create(
      tripId,
      normalizeCreateInput(input),
    );

    if (!item) throw this.dayNotFound();
    this.realtime.invalidate(tripId, ["itinerary"]);
    return item;
  }

  createInTransaction(
    transaction: DatabaseTransaction,
    tripId: string,
    input: CreateItineraryItemRequest,
  ): Promise<ItineraryItem | undefined> {
    return this.itemsRepository.createInTransaction(
      transaction,
      tripId,
      normalizeCreateInput(input),
    );
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

    const update = normalizeUpdateInput(input);

    const item = await this.itemsRepository.update(tripId, itemId, update);
    if (!item) throw this.itemNotFound();
    this.realtime.invalidate(
      tripId,
      input.place === undefined ? ["itinerary"] : ["itinerary", "routes"],
    );
    return item;
  }

  updateInTransaction(
    transaction: DatabaseTransaction,
    tripId: string,
    itemId: string,
    input: UpdateItineraryItemRequest,
  ): Promise<ItineraryItem | undefined> {
    return this.itemsRepository.updateInTransaction(
      transaction,
      tripId,
      itemId,
      normalizeUpdateInput(input),
    );
  }

  moveInTransaction(
    transaction: DatabaseTransaction,
    tripId: string,
    itemId: string,
    targetDayId: string,
    targetPosition: number,
  ): Promise<ItineraryItem | undefined> {
    return this.itemsRepository.moveInTransaction(
      transaction,
      tripId,
      itemId,
      targetDayId,
      targetPosition,
    );
  }

  async delete(userId: string, tripId: string, itemId: string): Promise<void> {
    await this.permissions.requireEditable(userId, tripId);
    if (!(await this.itemsRepository.delete(tripId, itemId))) {
      throw this.itemNotFound();
    }
    this.realtime.invalidate(tripId, ["itinerary", "routes"]);
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
      const items = await this.itemsRepository.reorder(tripId, input.days);
      this.realtime.invalidate(tripId, ["itinerary"]);
      return items;
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

function normalizeCreateInput(input: CreateItineraryItemRequest) {
  return {
    dayId: input.dayId,
    endTime: input.endTime ?? null,
    kind: input.kind,
    notes: normalizeItineraryNotes(input.notes),
    place: normalizeItineraryPlace(input.place) ?? null,
    startTime: input.startTime ?? null,
    title: input.title.trim(),
  };
}

function normalizeUpdateInput(
  input: UpdateItineraryItemRequest,
): UpdateItineraryItemRequest {
  const update: UpdateItineraryItemRequest = {};
  if (input.kind !== undefined) update.kind = input.kind;
  if (input.endTime !== undefined) update.endTime = input.endTime;
  if (input.title !== undefined) update.title = input.title.trim();
  if (input.startTime !== undefined) update.startTime = input.startTime;
  if (input.notes !== undefined) update.notes = normalizeItineraryNotes(input.notes);
  if (input.place !== undefined) update.place = normalizeItineraryPlace(input.place);
  return update;
}
