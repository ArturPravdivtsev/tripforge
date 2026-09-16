import { Inject, Injectable } from "@nestjs/common";
import type { TripDestination } from "@tripforge/contracts";
import { and, asc, eq, max } from "drizzle-orm";

import { DATABASE } from "../database/database.constants";
import type { Database } from "../database/database.provider";
import { tripDays, tripDestinations } from "../database/schema";

const destinationSelection = {
  createdAt: tripDestinations.createdAt,
  id: tripDestinations.id,
  name: tripDestinations.name,
  position: tripDestinations.position,
  updatedAt: tripDestinations.updatedAt,
};

function toDestination(row: {
  createdAt: Date;
  id: string;
  name: string;
  position: number;
  updatedAt: Date;
}): TripDestination {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export class DestinationOrderChangedError extends Error {}

@Injectable()
export class TripDestinationsRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async list(tripId: string): Promise<TripDestination[]> {
    const rows = await this.database
      .select(destinationSelection)
      .from(tripDestinations)
      .where(eq(tripDestinations.tripId, tripId))
      .orderBy(asc(tripDestinations.position), asc(tripDestinations.id));

    return rows.map(toDestination);
  }

  async exists(tripId: string, destinationId: string): Promise<boolean> {
    const [row] = await this.database
      .select({ id: tripDestinations.id })
      .from(tripDestinations)
      .where(
        and(
          eq(tripDestinations.tripId, tripId),
          eq(tripDestinations.id, destinationId),
        ),
      )
      .limit(1);

    return Boolean(row);
  }

  async create(tripId: string, name: string): Promise<TripDestination> {
    const [positionRow] = await this.database
      .select({ position: max(tripDestinations.position) })
      .from(tripDestinations)
      .where(eq(tripDestinations.tripId, tripId));
    const [row] = await this.database
      .insert(tripDestinations)
      .values({
        name,
        position: (positionRow?.position ?? -1) + 1,
        tripId,
      })
      .returning(destinationSelection);

    if (!row) {
      throw new Error("Destination insert did not return a row");
    }

    return toDestination(row);
  }

  async update(
    tripId: string,
    destinationId: string,
    name: string,
  ): Promise<TripDestination | undefined> {
    const [row] = await this.database
      .update(tripDestinations)
      .set({ name, updatedAt: new Date() })
      .where(
        and(
          eq(tripDestinations.tripId, tripId),
          eq(tripDestinations.id, destinationId),
        ),
      )
      .returning(destinationSelection);

    return row ? toDestination(row) : undefined;
  }

  async delete(tripId: string, destinationId: string): Promise<boolean> {
    return this.database.transaction(async (transaction) => {
      await transaction
        .update(tripDays)
        .set({ destinationId: null, updatedAt: new Date() })
        .where(
          and(
            eq(tripDays.tripId, tripId),
            eq(tripDays.destinationId, destinationId),
          ),
        );
      const removed = await transaction
        .delete(tripDestinations)
        .where(
          and(
            eq(tripDestinations.tripId, tripId),
            eq(tripDestinations.id, destinationId),
          ),
        )
        .returning({ id: tripDestinations.id });

      return removed.length > 0;
    });
  }

  async reorder(tripId: string, destinationIds: readonly string[]): Promise<void> {
    await this.database.transaction(async (transaction) => {
      for (const [position, destinationId] of destinationIds.entries()) {
        const updated = await transaction
          .update(tripDestinations)
          .set({ position, updatedAt: new Date() })
          .where(
            and(
              eq(tripDestinations.tripId, tripId),
              eq(tripDestinations.id, destinationId),
            ),
          )
          .returning({ id: tripDestinations.id });

        if (updated.length === 0) {
          throw new DestinationOrderChangedError();
        }
      }
    });
  }
}
