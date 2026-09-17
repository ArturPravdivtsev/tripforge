import { sql } from "drizzle-orm";
import {
  check,
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
  ],
);
