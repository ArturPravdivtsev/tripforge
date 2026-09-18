import { sql } from "drizzle-orm";
import {
  check,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import type { TripRouteGeometry } from "@tripforge/contracts";

import { itineraryItems } from "./itinerary-items";
import { trips } from "./trips";

export const tripRouteMode = pgEnum("trip_route_mode", [
  "walking",
  "cycling",
  "driving",
]);

export const tripRouteSegments = pgTable(
  "trip_route_segments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tripId: uuid("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    fromItemId: uuid("from_item_id")
      .notNull()
      .references(() => itineraryItems.id, { onDelete: "cascade" }),
    toItemId: uuid("to_item_id")
      .notNull()
      .references(() => itineraryItems.id, { onDelete: "cascade" }),
    mode: tripRouteMode("mode").notNull(),
    distanceMeters: integer("distance_meters").notNull(),
    durationSeconds: integer("duration_seconds").notNull(),
    geometry: jsonb("geometry").$type<TripRouteGeometry>().notNull(),
    originLatitude: doublePrecision("origin_latitude").notNull(),
    originLongitude: doublePrecision("origin_longitude").notNull(),
    destinationLatitude: doublePrecision("destination_latitude").notNull(),
    destinationLongitude: doublePrecision("destination_longitude").notNull(),
    provider: varchar("provider", { length: 32 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("trip_route_segments_trip_pair_unique").on(
      table.tripId,
      table.fromItemId,
      table.toItemId,
    ),
    index("trip_route_segments_from_item_idx").on(table.fromItemId),
    index("trip_route_segments_to_item_idx").on(table.toItemId),
    check(
      "trip_route_segments_different_endpoints_check",
      sql`${table.fromItemId} <> ${table.toItemId}`,
    ),
    check(
      "trip_route_segments_distance_nonnegative_check",
      sql`${table.distanceMeters} >= 0`,
    ),
    check(
      "trip_route_segments_duration_nonnegative_check",
      sql`${table.durationSeconds} >= 0`,
    ),
    check(
      "trip_route_segments_origin_latitude_range_check",
      sql`${table.originLatitude} between -90 and 90`,
    ),
    check(
      "trip_route_segments_origin_longitude_range_check",
      sql`${table.originLongitude} between -180 and 180`,
    ),
    check(
      "trip_route_segments_destination_latitude_range_check",
      sql`${table.destinationLatitude} between -90 and 90`,
    ),
    check(
      "trip_route_segments_destination_longitude_range_check",
      sql`${table.destinationLongitude} between -180 and 180`,
    ),
    check(
      "trip_route_segments_provider_check",
      sql`${table.provider} = 'openrouteservice'`,
    ),
  ],
);
