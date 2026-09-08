import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { users } from "./users";

export const trips = pgTable(
  "trips",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    name: varchar("name", { length: 200 }).notNull(),
    startsOn: date("starts_on"),
    endsOn: date("ends_on"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("trips_owner_id_idx").on(table.ownerId),
    check(
      "trips_name_not_blank_check",
      sql`length(btrim(${table.name})) > 0`,
    ),
    check(
      "trips_date_range_check",
      sql`${table.endsOn} is null or ${table.startsOn} is null or ${table.endsOn} >= ${table.startsOn}`,
    ),
  ],
);
