import { Inject, Injectable } from "@nestjs/common";
import type {
  ItineraryItem,
  ItineraryItemKind,
  ReorderItineraryItemsRequest,
  UpdateItineraryItemRequest,
} from "@tripforge/contracts";
import { and, asc, eq, exists, inArray, max, sql } from "drizzle-orm";

import { DATABASE } from "../database/database.constants";
import type { Database } from "../database/database.provider";
import { itineraryItems, tripDays } from "../database/schema";

const itemSelection = {
  createdAt: itineraryItems.createdAt,
  dayId: itineraryItems.tripDayId,
  id: itineraryItems.id,
  kind: itineraryItems.kind,
  notes: itineraryItems.notes,
  position: itineraryItems.position,
  startTime: itineraryItems.startTime,
  title: itineraryItems.title,
  updatedAt: itineraryItems.updatedAt,
};

type ItemRow = {
  createdAt: Date;
  dayId: string;
  id: string;
  kind: ItineraryItemKind;
  notes: string | null;
  position: number;
  startTime: string | null;
  title: string;
  updatedAt: Date;
};

type CreateItem = Readonly<{
  dayId: string;
  kind: ItineraryItemKind;
  notes: string | null;
  startTime: string | null;
  title: string;
}>;

function toItem(row: ItemRow): ItineraryItem {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    startTime: row.startTime?.slice(0, 5) ?? null,
    updatedAt: row.updatedAt.toISOString(),
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
    return this.database.transaction(async (transaction) => {
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
          notes: input.notes,
          position: (positionRow?.position ?? -1) + 1,
          startTime: input.startTime,
          title: input.title,
          tripDayId: input.dayId,
        })
        .returning(itemSelection);

      if (!row) throw new Error("Itinerary item insert did not return a row");
      return toItem(row);
    });
  }

  async update(
    tripId: string,
    itemId: string,
    input: UpdateItineraryItemRequest,
  ): Promise<ItineraryItem | undefined> {
    const scopedDay = exists(
      this.database
        .select({ value: sql`1` })
        .from(tripDays)
        .where(
          and(
            eq(tripDays.id, itineraryItems.tripDayId),
            eq(tripDays.tripId, tripId),
          ),
        ),
    );
    const [row] = await this.database
      .update(itineraryItems)
      .set({ ...input, updatedAt: new Date() })
      .where(and(eq(itineraryItems.id, itemId), scopedDay))
      .returning(itemSelection);

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
