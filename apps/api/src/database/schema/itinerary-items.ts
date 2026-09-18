import { sql } from "drizzle-orm";
import {
  check,
  doublePrecision,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  time,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { tripDays } from "./trip-days";

export const itineraryItemKind = pgEnum("itinerary_item_kind", [
  "activity",
  "food",
  "transport",
  "accommodation",
  "other",
]);

export const itineraryItems = pgTable(
  "itinerary_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tripDayId: uuid("trip_day_id")
      .notNull()
      .references(() => tripDays.id, { onDelete: "cascade" }),
    kind: itineraryItemKind("kind").notNull(),
    title: varchar("title", { length: 200 }).notNull(),
    startTime: time("start_time", { precision: 0 }),
    notes: text("notes"),
    placeName: varchar("place_name", { length: 200 }),
    placeAddress: varchar("place_address", { length: 500 }),
    placeLatitude: doublePrecision("place_latitude"),
    placeLongitude: doublePrecision("place_longitude"),
    placeProvider: varchar("place_provider", { length: 32 }),
    placeProviderRef: varchar("place_provider_ref", { length: 300 }),
    position: integer("position").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("itinerary_items_day_position_idx").on(
      table.tripDayId,
      table.position,
      table.id,
    ),
    check(
      "itinerary_items_title_not_blank_check",
      sql`length(btrim(${table.title})) > 0`,
    ),
    check(
      "itinerary_items_notes_length_check",
      sql`${table.notes} is null or length(${table.notes}) <= 5000`,
    ),
    check(
      "itinerary_items_position_nonnegative_check",
      sql`${table.position} >= 0`,
    ),
    check(
      "itinerary_items_place_state_check",
      sql`(
        ${table.placeName} is null
        and ${table.placeAddress} is null
        and ${table.placeLatitude} is null
        and ${table.placeLongitude} is null
        and ${table.placeProvider} is null
        and ${table.placeProviderRef} is null
      ) or (
        ${table.placeName} is not null
        and ${table.placeLatitude} is not null
        and ${table.placeLongitude} is not null
        and ${table.placeProvider} is not null
      )`,
    ),
    check(
      "itinerary_items_place_name_not_blank_check",
      sql`${table.placeName} is null or length(btrim(${table.placeName})) > 0`,
    ),
    check(
      "itinerary_items_place_address_not_blank_check",
      sql`${table.placeAddress} is null or length(btrim(${table.placeAddress})) > 0`,
    ),
    check(
      "itinerary_items_place_latitude_range_check",
      sql`${table.placeLatitude} is null or (${table.placeLatitude} >= -90 and ${table.placeLatitude} <= 90)`,
    ),
    check(
      "itinerary_items_place_longitude_range_check",
      sql`${table.placeLongitude} is null or (${table.placeLongitude} >= -180 and ${table.placeLongitude} <= 180)`,
    ),
    check(
      "itinerary_items_place_provider_check",
      sql`${table.placeProvider} is null or ${table.placeProvider} = 'maptiler'`,
    ),
    check(
      "itinerary_items_place_provider_ref_not_blank_check",
      sql`${table.placeProviderRef} is null or length(btrim(${table.placeProviderRef})) > 0`,
    ),
  ],
);
