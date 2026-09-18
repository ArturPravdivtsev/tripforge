import { Inject, Injectable } from "@nestjs/common";
import type {
  TripRouteMode,
  TripRouteSegment,
} from "@tripforge/contracts";
import { and, asc, eq, inArray, or } from "drizzle-orm";

import type { CalculatedRoute } from "../routing/openrouteservice.client";
import { DATABASE } from "../database/database.constants";
import type { Database } from "../database/database.provider";
import {
  itineraryItems,
  tripDays,
  tripRouteSegments,
} from "../database/schema";

const routeSelection = {
  createdAt: tripRouteSegments.createdAt,
  distanceMeters: tripRouteSegments.distanceMeters,
  durationSeconds: tripRouteSegments.durationSeconds,
  fromItemId: tripRouteSegments.fromItemId,
  geometry: tripRouteSegments.geometry,
  id: tripRouteSegments.id,
  mode: tripRouteSegments.mode,
  toItemId: tripRouteSegments.toItemId,
  updatedAt: tripRouteSegments.updatedAt,
};

type RouteRow = {
  createdAt: Date;
  distanceMeters: number;
  durationSeconds: number;
  fromItemId: string;
  geometry: TripRouteSegment["geometry"];
  id: string;
  mode: TripRouteMode;
  toItemId: string;
  updatedAt: Date;
};

export type RouteEndpointSnapshot = Readonly<{
  itemId: string;
  latitude: number;
  longitude: number;
}>;

export type RouteEndpointLookup = Readonly<{
  itemId: string;
  latitude: number | null;
  longitude: number | null;
}>;

export class RouteAlreadyExistsError extends Error {}
export class RouteEndpointChangedError extends Error {}
export class RouteNotFoundError extends Error {}

@Injectable()
export class TripRoutesRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async list(tripId: string): Promise<TripRouteSegment[]> {
    const rows = await this.database
      .select(routeSelection)
      .from(tripRouteSegments)
      .where(eq(tripRouteSegments.tripId, tripId))
      .orderBy(asc(tripRouteSegments.createdAt), asc(tripRouteSegments.id));

    return rows.map(toRoute);
  }

  async find(tripId: string, routeId: string): Promise<TripRouteSegment | undefined> {
    const [row] = await this.database
      .select(routeSelection)
      .from(tripRouteSegments)
      .where(
        and(
          eq(tripRouteSegments.id, routeId),
          eq(tripRouteSegments.tripId, tripId),
        ),
      )
      .limit(1);

    return row ? toRoute(row) : undefined;
  }

  async pairExists(
    tripId: string,
    fromItemId: string,
    toItemId: string,
  ): Promise<boolean> {
    const [row] = await this.database
      .select({ id: tripRouteSegments.id })
      .from(tripRouteSegments)
      .where(
        and(
          eq(tripRouteSegments.tripId, tripId),
          eq(tripRouteSegments.fromItemId, fromItemId),
          eq(tripRouteSegments.toItemId, toItemId),
        ),
      )
      .limit(1);

    return Boolean(row);
  }

  async getEndpoints(
    tripId: string,
    itemIds: readonly string[],
  ): Promise<RouteEndpointLookup[]> {
    return this.database
      .select({
        itemId: itineraryItems.id,
        latitude: itineraryItems.placeLatitude,
        longitude: itineraryItems.placeLongitude,
      })
      .from(itineraryItems)
      .innerJoin(tripDays, eq(tripDays.id, itineraryItems.tripDayId))
      .where(
        and(
          eq(tripDays.tripId, tripId),
          inArray(itineraryItems.id, [...itemIds]),
        ),
      );
  }

  async create(
    tripId: string,
    from: RouteEndpointSnapshot,
    to: RouteEndpointSnapshot,
    mode: TripRouteMode,
    route: CalculatedRoute,
  ): Promise<TripRouteSegment> {
    try {
      return await this.database.transaction(async (transaction) => {
        await revalidateEndpoints(transaction, tripId, from, to);
        const [row] = await transaction
          .insert(tripRouteSegments)
          .values({
            destinationLatitude: to.latitude,
            destinationLongitude: to.longitude,
            distanceMeters: route.distanceMeters,
            durationSeconds: route.durationSeconds,
            fromItemId: from.itemId,
            geometry: route.geometry,
            mode,
            originLatitude: from.latitude,
            originLongitude: from.longitude,
            provider: "openrouteservice",
            toItemId: to.itemId,
            tripId,
          })
          .returning(routeSelection);

        if (!row) throw new Error("Route insert did not return a row");
        return toRoute(row);
      });
    } catch (error) {
      if (hasPostgresCode(error, "23505")) throw new RouteAlreadyExistsError();
      throw error;
    }
  }

  async update(
    tripId: string,
    routeId: string,
    from: RouteEndpointSnapshot,
    to: RouteEndpointSnapshot,
    mode: TripRouteMode,
    route: CalculatedRoute,
  ): Promise<TripRouteSegment> {
    return this.database.transaction(async (transaction) => {
      await revalidateEndpoints(transaction, tripId, from, to);
      const [row] = await transaction
        .update(tripRouteSegments)
        .set({
          destinationLatitude: to.latitude,
          destinationLongitude: to.longitude,
          distanceMeters: route.distanceMeters,
          durationSeconds: route.durationSeconds,
          geometry: route.geometry,
          mode,
          originLatitude: from.latitude,
          originLongitude: from.longitude,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(tripRouteSegments.id, routeId),
            eq(tripRouteSegments.tripId, tripId),
          ),
        )
        .returning(routeSelection);

      if (!row) throw new RouteNotFoundError();
      return toRoute(row);
    });
  }

  async delete(tripId: string, routeId: string): Promise<boolean> {
    const rows = await this.database
      .delete(tripRouteSegments)
      .where(
        and(
          eq(tripRouteSegments.id, routeId),
          eq(tripRouteSegments.tripId, tripId),
        ),
      )
      .returning({ id: tripRouteSegments.id });

    return rows.length > 0;
  }
}

async function revalidateEndpoints(
  transaction: Parameters<Parameters<Database["transaction"]>[0]>[0],
  tripId: string,
  from: RouteEndpointSnapshot,
  to: RouteEndpointSnapshot,
): Promise<void> {
  const rows = await transaction
    .select({
      itemId: itineraryItems.id,
      latitude: itineraryItems.placeLatitude,
      longitude: itineraryItems.placeLongitude,
    })
    .from(itineraryItems)
    .innerJoin(tripDays, eq(tripDays.id, itineraryItems.tripDayId))
    .where(
      and(
        eq(tripDays.tripId, tripId),
        or(
          eq(itineraryItems.id, from.itemId),
          eq(itineraryItems.id, to.itemId),
        ),
      ),
    )
    .for("update", { of: itineraryItems });

  for (const expected of [from, to]) {
    const current = rows.find(({ itemId }) => itemId === expected.itemId);
    if (
      !current ||
      current.latitude !== expected.latitude ||
      current.longitude !== expected.longitude
    ) {
      throw new RouteEndpointChangedError();
    }
  }
}

function toRoute(row: RouteRow): TripRouteSegment {
  return {
    createdAt: row.createdAt.toISOString(),
    distanceMeters: row.distanceMeters,
    durationSeconds: row.durationSeconds,
    fromItemId: row.fromItemId,
    geometry: row.geometry,
    id: row.id,
    mode: row.mode,
    toItemId: row.toItemId,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function hasPostgresCode(error: unknown, code: string): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current; depth += 1) {
    if (
      typeof current === "object" &&
      "code" in current &&
      current.code === code
    ) {
      return true;
    }
    current =
      typeof current === "object" && "cause" in current
        ? current.cause
        : undefined;
  }
  return false;
}
