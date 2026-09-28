import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  date,
  index,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { tripReservations } from "./trip-reservations";
import { searchVector } from "./search-vector";
import { trips } from "./trips";
import { users } from "./users";

export const tripExpenseCategory = pgEnum("trip_expense_category", [
  "accommodation",
  "transport",
  "food",
  "activity",
  "shopping",
  "other",
]);

export const tripExpenseSplitMethod = pgEnum("trip_expense_split_method", [
  "equal",
  "custom",
]);

export const tripExpenses = pgTable(
  "trip_expenses",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tripId: uuid("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    reservationId: uuid("reservation_id").references(
      () => tripReservations.id,
      { onDelete: "set null" },
    ),
    title: varchar("title", { length: 200 }).notNull(),
    category: tripExpenseCategory("category").notNull(),
    spentOn: date("spent_on").notNull(),
    currency: varchar("currency", { length: 3 }).notNull(),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    paidByUserId: uuid("paid_by_user_id")
      .notNull()
      .references(() => users.id),
    splitMethod: tripExpenseSplitMethod("split_method").notNull(),
    notes: text("notes"),
    searchVector: searchVector("search_vector").generatedAlwaysAs(
      sql`setweight(to_tsvector('simple'::regconfig, coalesce("title", '')), 'A') || setweight(to_tsvector('simple'::regconfig, coalesce("notes", '')), 'D')`,
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("trip_expenses_trip_idx").on(table.tripId),
    index("trip_expenses_reservation_idx").on(table.reservationId),
    index("trip_expenses_payer_idx").on(table.paidByUserId),
    index("trip_expenses_search_vector_idx").using(
      "gin",
      table.searchVector,
    ),
    index("trip_expenses_title_trgm_idx").using(
      "gin",
      table.title.op("gin_trgm_ops"),
    ),
    index("trip_expenses_list_idx").on(
      table.tripId,
      table.spentOn,
      table.createdAt,
      table.id,
    ),
    check(
      "trip_expenses_title_not_blank_check",
      sql`length(btrim(${table.title})) > 0`,
    ),
    check(
      "trip_expenses_currency_check",
      sql`${table.currency} ~ '^[A-Z]{3}$'`,
    ),
    check(
      "trip_expenses_amount_minor_check",
      sql`${table.amountMinor} > 0 and ${table.amountMinor} <= 9007199254740991`,
    ),
    check(
      "trip_expenses_notes_length_check",
      sql`${table.notes} is null or length(${table.notes}) <= 5000`,
    ),
  ],
);

export const tripExpenseSplits = pgTable(
  "trip_expense_splits",
  {
    expenseId: uuid("expense_id")
      .notNull()
      .references(() => tripExpenses.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.expenseId, table.userId] }),
    index("trip_expense_splits_user_idx").on(table.userId),
    check(
      "trip_expense_splits_amount_minor_check",
      sql`${table.amountMinor} >= 0 and ${table.amountMinor} <= 9007199254740991`,
    ),
  ],
);
