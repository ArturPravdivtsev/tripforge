import { sql } from "drizzle-orm";
import {
  check,
  doublePrecision,
  index,
  integer,
  pgTable,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { trips } from "./trips";

export const tripDestinations = pgTable(
  "trip_destinations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tripId: uuid("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 160 }).notNull(),
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),
    position: integer("position").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("trip_destinations_trip_position_idx").on(
      table.tripId,
      table.position,
      table.id,
    ),
    unique("trip_destinations_trip_id_id_unique").on(table.tripId, table.id),
    check(
      "trip_destinations_name_not_blank_check",
      sql`length(btrim(${table.name})) > 0`,
    ),
    check(
      "trip_destinations_position_nonnegative_check",
      sql`${table.position} >= 0`,
    ),
    check(
      "trip_destinations_coordinates_pair_check",
      sql`(${table.latitude} IS NULL AND ${table.longitude} IS NULL) OR (${table.latitude} IS NOT NULL AND ${table.longitude} IS NOT NULL)`,
    ),
    check(
      "trip_destinations_latitude_range_check",
      sql`${table.latitude} IS NULL OR ${table.latitude} BETWEEN -90 AND 90`,
    ),
    check(
      "trip_destinations_longitude_range_check",
      sql`${table.longitude} IS NULL OR ${table.longitude} BETWEEN -180 AND 180`,
    ),
  ],
);
