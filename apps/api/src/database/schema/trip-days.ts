import {
  date,
  foreignKey,
  index,
  pgTable,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { tripDestinations } from "./trip-destinations";
import { trips } from "./trips";

export const tripDays = pgTable(
  "trip_days",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tripId: uuid("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    destinationId: uuid("destination_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("trip_days_trip_id_date_unique").on(table.tripId, table.date),
    index("trip_days_trip_destination_idx").on(
      table.tripId,
      table.destinationId,
    ),
    foreignKey({
      columns: [table.tripId, table.destinationId],
      foreignColumns: [tripDestinations.tripId, tripDestinations.id],
      name: "trip_days_trip_destination_fk",
    }).onDelete("no action"),
  ],
);
