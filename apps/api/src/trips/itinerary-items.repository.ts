import { Inject, Injectable } from "@nestjs/common";
import type {
  ItineraryItem,
  ItineraryItemKind,
  ItineraryPlaceInput,
  ReorderItineraryItemsRequest,
  UpdateItineraryItemRequest,
} from "@tripforge/contracts";
import { and, asc, eq, inArray, max, or } from "drizzle-orm";

import { DATABASE } from "../database/database.constants";
import type { Database } from "../database/database.provider";
import type { DatabaseTransaction } from "../database/database.provider";
import {
  itineraryItems,
  tripDays,
  tripRouteSegments,
} from "../database/schema";

const itemSelection = {
  createdAt: itineraryItems.createdAt,
  dayId: itineraryItems.tripDayId,
  endTime: itineraryItems.endTime,
  id: itineraryItems.id,
  kind: itineraryItems.kind,
  notes: itineraryItems.notes,
  placeAddress: itineraryItems.placeAddress,
  placeLatitude: itineraryItems.placeLatitude,
  placeLongitude: itineraryItems.placeLongitude,
  placeName: itineraryItems.placeName,
  placeProvider: itineraryItems.placeProvider,
  placeProviderRef: itineraryItems.placeProviderRef,
  position: itineraryItems.position,
  startTime: itineraryItems.startTime,
  title: itineraryItems.title,
  updatedAt: itineraryItems.updatedAt,
};

type ItemRow = {
  createdAt: Date;
  dayId: string;
  endTime: string | null;
  id: string;
  kind: ItineraryItemKind;
  notes: string | null;
  placeAddress: string | null;
  placeLatitude: number | null;
  placeLongitude: number | null;
  placeName: string | null;
  placeProvider: string | null;
  placeProviderRef: string | null;
  position: number;
  startTime: string | null;
  title: string;
  updatedAt: Date;
};

type CreateItem = Readonly<{
  dayId: string;
  endTime: string | null;
  kind: ItineraryItemKind;
  notes: string | null;
  place: ItineraryPlaceInput | null;
  startTime: string | null;
  title: string;
}>;

function toItem(row: ItemRow): ItineraryItem {
  return {
    dayId: row.dayId,
    endTime: row.endTime?.slice(0, 5) ?? null,
    id: row.id,
    kind: row.kind,
    notes: row.notes,
    place:
      row.placeName === null ||
      row.placeLatitude === null ||
      row.placeLongitude === null ||
      row.placeProvider === null
        ? null
        : {
            address: row.placeAddress,
            latitude: row.placeLatitude,
            longitude: row.placeLongitude,
            name: row.placeName,
            provider: "maptiler",
            providerReference: row.placeProviderRef,
          },
    position: row.position,
    createdAt: row.createdAt.toISOString(),
    startTime: row.startTime?.slice(0, 5) ?? null,
    title: row.title,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function placeColumns(place: ItineraryPlaceInput | null) {
  return place
    ? {
        placeAddress: place.address ?? null,
        placeLatitude: place.latitude,
        placeLongitude: place.longitude,
        placeName: place.name,
        placeProvider: place.provider,
        placeProviderRef: place.providerReference ?? null,
      }
    : {
        placeAddress: null,
        placeLatitude: null,
        placeLongitude: null,
        placeName: null,
        placeProvider: null,
        placeProviderRef: null,
      };
}

export class InvalidItineraryOrderError extends Error {}

@Injectable()
export class ItineraryItemsRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async list(tripId: string): Promise<ItineraryItem[]> {
    const rows = await this.database
      .select(itemSelection)
      .from(itineraryItems)
      .innerJoin(tripDays, eq(tripDays.id, itineraryItems.tripDayId))
      .where(eq(tripDays.tripId, tripId))
      .orderBy(
        asc(tripDays.date),
        asc(itineraryItems.position),
        asc(itineraryItems.id),
      );

    return rows.map(toItem);
  }

  async create(tripId: string, input: CreateItem): Promise<ItineraryItem | undefined> {
    return this.database.transaction((transaction) =>
      this.createInTransaction(transaction, tripId, input),
    );
  }

  async createInTransaction(
    transaction: DatabaseTransaction,
    tripId: string,
    input: CreateItem,
  ): Promise<ItineraryItem | undefined> {
      const [day] = await transaction
        .select({ id: tripDays.id })
        .from(tripDays)
        .where(and(eq(tripDays.id, input.dayId), eq(tripDays.tripId, tripId)))
        .for("update")
        .limit(1);

      if (!day) return undefined;

      const [positionRow] = await transaction
        .select({ position: max(itineraryItems.position) })
        .from(itineraryItems)
        .where(eq(itineraryItems.tripDayId, input.dayId));
      const [row] = await transaction
        .insert(itineraryItems)
        .values({
          kind: input.kind,
          endTime: input.endTime,
          notes: input.notes,
          ...placeColumns(input.place),
          position: (positionRow?.position ?? -1) + 1,
          startTime: input.startTime,
          title: input.title,
          tripDayId: input.dayId,
        })
        .returning(itemSelection);

      if (!row) throw new Error("Itinerary item insert did not return a row");
      return toItem(row);
  }

  async update(
    tripId: string,
    itemId: string,
    input: UpdateItineraryItemRequest,
  ): Promise<ItineraryItem | undefined> {
    return this.database.transaction((transaction) =>
      this.updateInTransaction(transaction, tripId, itemId, input),
    );
  }

  async updateInTransaction(
    transaction: DatabaseTransaction,
    tripId: string,
    itemId: string,
    input: UpdateItineraryItemRequest,
  ): Promise<ItineraryItem | undefined> {
      const [current] = await transaction
        .select({
          id: itineraryItems.id,
          latitude: itineraryItems.placeLatitude,
          longitude: itineraryItems.placeLongitude,
        })
        .from(itineraryItems)
        .innerJoin(tripDays, eq(tripDays.id, itineraryItems.tripDayId))
        .where(
          and(
            eq(itineraryItems.id, itemId),
            eq(tripDays.tripId, tripId),
          ),
        )
        .for("update", { of: itineraryItems })
        .limit(1);

      if (!current) return undefined;

      const changes = {
        ...(input.kind === undefined ? {} : { kind: input.kind }),
        ...(input.endTime === undefined ? {} : { endTime: input.endTime }),
        ...(input.notes === undefined ? {} : { notes: input.notes }),
        ...(input.startTime === undefined ? {} : { startTime: input.startTime }),
        ...(input.title === undefined ? {} : { title: input.title }),
        ...(input.place === undefined ? {} : placeColumns(input.place)),
        updatedAt: new Date(),
      };
      const nextLatitude =
        input.place === undefined ? current.latitude : (input.place?.latitude ?? null);
      const nextLongitude =
        input.place === undefined ? current.longitude : (input.place?.longitude ?? null);
      const coordinatesChanged =
        input.place !== undefined &&
        (current.latitude !== nextLatitude || current.longitude !== nextLongitude);

      if (coordinatesChanged) {
        await transaction
          .delete(tripRouteSegments)
          .where(
            or(
              eq(tripRouteSegments.fromItemId, itemId),
              eq(tripRouteSegments.toItemId, itemId),
            ),
          );
      }

      const [row] = await transaction
        .update(itineraryItems)
        .set(changes)
        .where(eq(itineraryItems.id, itemId))
        .returning(itemSelection);

      return row ? toItem(row) : undefined;
  }

  async moveInTransaction(
    transaction: DatabaseTransaction,
    tripId: string,
    itemId: string,
    targetDayId: string,
    targetPosition: number,
  ): Promise<ItineraryItem | undefined> {
    const [targetDay] = await transaction
      .select({ id: tripDays.id })
      .from(tripDays)
      .where(and(eq(tripDays.id, targetDayId), eq(tripDays.tripId, tripId)))
      .for("update")
      .limit(1);
    const [current] = await transaction
      .select({ dayId: itineraryItems.tripDayId })
      .from(itineraryItems)
      .innerJoin(tripDays, eq(tripDays.id, itineraryItems.tripDayId))
      .where(and(eq(itineraryItems.id, itemId), eq(tripDays.tripId, tripId)))
      .for("update", { of: itineraryItems })
      .limit(1);
    if (!targetDay || !current) return undefined;

    const dayIds = [...new Set([current.dayId, targetDayId])];
    const rows = await transaction
      .select({
        dayId: itineraryItems.tripDayId,
        id: itineraryItems.id,
      })
      .from(itineraryItems)
      .where(inArray(itineraryItems.tripDayId, dayIds))
      .orderBy(asc(itineraryItems.position), asc(itineraryItems.id))
      .for("update");
    const byDay = new Map(dayIds.map((dayId) => [
      dayId,
      rows.filter((row) => row.dayId === dayId && row.id !== itemId).map(({ id }) => id),
    ]));
    const target = byDay.get(targetDayId);
    if (!target || targetPosition > target.length) return undefined;
    target.splice(targetPosition, 0, itemId);

    for (const [dayId, itemIds] of byDay) {
      for (const [position, id] of itemIds.entries()) {
        await transaction
          .update(itineraryItems)
          .set({ position, tripDayId: dayId, updatedAt: new Date() })
          .where(eq(itineraryItems.id, id));
      }
    }
    const [row] = await transaction
      .select(itemSelection)
      .from(itineraryItems)
      .where(eq(itineraryItems.id, itemId))
      .limit(1);
    return row ? toItem(row) : undefined;
  }

  async delete(tripId: string, itemId: string): Promise<boolean> {
    return this.database.transaction(async (transaction) => {
      const [item] = await transaction
        .select({ dayId: itineraryItems.tripDayId })
        .from(itineraryItems)
        .innerJoin(tripDays, eq(tripDays.id, itineraryItems.tripDayId))
        .where(and(eq(itineraryItems.id, itemId), eq(tripDays.tripId, tripId)))
        .for("update", { of: itineraryItems })
        .limit(1);

      if (!item) return false;

      await transaction.delete(itineraryItems).where(eq(itineraryItems.id, itemId));
      const remaining = await transaction
        .select({ id: itineraryItems.id })
        .from(itineraryItems)
        .where(eq(itineraryItems.tripDayId, item.dayId))
        .orderBy(asc(itineraryItems.position), asc(itineraryItems.id));

      for (const [position, { id }] of remaining.entries()) {
        await transaction
          .update(itineraryItems)
          .set({ position, updatedAt: new Date() })
          .where(eq(itineraryItems.id, id));
      }

      return true;
    });
  }

  async reorder(
    tripId: string,
    days: ReorderItineraryItemsRequest["days"],
  ): Promise<ItineraryItem[]> {
    await this.database.transaction(async (transaction) => {
      const dayIds = days.map(({ dayId }) => dayId);
      const currentDays = await transaction
        .select({ id: tripDays.id })
        .from(tripDays)
        .where(and(eq(tripDays.tripId, tripId), inArray(tripDays.id, dayIds)))
        .for("update");

      if (currentDays.length !== dayIds.length) {
        throw new InvalidItineraryOrderError();
      }

      const currentItems = await transaction
        .select({ id: itineraryItems.id })
        .from(itineraryItems)
        .where(inArray(itineraryItems.tripDayId, dayIds))
        .for("update");
      const desiredIds = days.flatMap(({ itemIds }) => itemIds);
      const currentIds = currentItems.map(({ id }) => id);

      if (
        currentIds.length !== desiredIds.length ||
        !desiredIds.every((id) => currentIds.includes(id))
      ) {
        throw new InvalidItineraryOrderError();
      }

      for (const { dayId, itemIds } of days) {
        for (const [position, itemId] of itemIds.entries()) {
          const updated = await transaction
            .update(itineraryItems)
            .set({ position, tripDayId: dayId, updatedAt: new Date() })
            .where(eq(itineraryItems.id, itemId))
            .returning({ id: itineraryItems.id });

          if (updated.length === 0) throw new InvalidItineraryOrderError();
        }
      }
    });

    return this.list(tripId);
  }
}
