import { Inject, Injectable } from "@nestjs/common";
import type { Trip } from "@tripforge/contracts";
import { and, count, desc, eq } from "drizzle-orm";

import { DATABASE } from "../database/database.constants";
import type { Database } from "../database/database.provider";
import { trips } from "../database/schema";

const tripSelection = {
  createdAt: trips.createdAt,
  endsOn: trips.endsOn,
  id: trips.id,
  name: trips.name,
  startsOn: trips.startsOn,
  updatedAt: trips.updatedAt,
};

type TripRow = {
  createdAt: Date;
  endsOn: string | null;
  id: string;
  name: string;
  startsOn: string | null;
  updatedAt: Date;
};

type TripWrite = {
  endsOn?: string | null;
  name?: string;
  startsOn?: string | null;
};

function toTrip(row: TripRow): Trip {
  return {
    createdAt: row.createdAt.toISOString(),
    endsOn: row.endsOn,
    id: row.id,
    name: row.name,
    startsOn: row.startsOn,
    updatedAt: row.updatedAt.toISOString(),
  };
}

@Injectable()
export class TripsRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async create(ownerId: string, input: Required<TripWrite>): Promise<Trip> {
    const [row] = await this.database
      .insert(trips)
      .values({ ownerId, ...input })
      .returning(tripSelection);

    if (!row) {
      throw new Error("Trip insert did not return a row");
    }

    return toTrip(row);
  }

  async findOwnedById(
    ownerId: string,
    tripId: string,
  ): Promise<Trip | undefined> {
    const [row] = await this.database
      .select(tripSelection)
      .from(trips)
      .where(and(eq(trips.id, tripId), eq(trips.ownerId, ownerId)))
      .limit(1);

    return row ? toTrip(row) : undefined;
  }

  async listOwned(
    ownerId: string,
    page: number,
    pageSize: number,
  ): Promise<{ items: Trip[]; total: number }> {
    const offset = (page - 1) * pageSize;
    const [rows, totals] = await Promise.all([
      this.database
        .select(tripSelection)
        .from(trips)
        .where(eq(trips.ownerId, ownerId))
        .orderBy(desc(trips.createdAt), desc(trips.id))
        .limit(pageSize)
        .offset(offset),
      this.database
        .select({ total: count() })
        .from(trips)
        .where(eq(trips.ownerId, ownerId)),
    ]);

    return {
      items: rows.map(toTrip),
      total: totals[0]?.total ?? 0,
    };
  }

  async updateOwned(
    ownerId: string,
    tripId: string,
    input: TripWrite,
  ): Promise<Trip | undefined> {
    const [row] = await this.database
      .update(trips)
      .set({ ...input, updatedAt: new Date() })
      .where(and(eq(trips.id, tripId), eq(trips.ownerId, ownerId)))
      .returning(tripSelection);

    return row ? toTrip(row) : undefined;
  }

  async deleteOwned(ownerId: string, tripId: string): Promise<boolean> {
    const deleted = await this.database
      .delete(trips)
      .where(and(eq(trips.id, tripId), eq(trips.ownerId, ownerId)))
      .returning({ id: trips.id });

    return deleted.length > 0;
  }
}
