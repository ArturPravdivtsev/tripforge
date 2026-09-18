import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  time,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { itineraryItems } from "./itinerary-items";
import { trips } from "./trips";

export const tripReservationKind = pgEnum("trip_reservation_kind", [
  "accommodation",
  "transport",
  "restaurant",
  "activity",
  "other",
]);

export const tripReservationStatus = pgEnum("trip_reservation_status", [
  "pending",
  "confirmed",
  "cancelled",
]);

export const transportReservationMode = pgEnum("transport_reservation_mode", [
  "flight",
  "train",
  "bus",
  "ferry",
  "other",
]);

export const tripReservations = pgTable(
  "trip_reservations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tripId: uuid("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    itineraryItemId: uuid("itinerary_item_id").references(
      () => itineraryItems.id,
      { onDelete: "set null" },
    ),
    kind: tripReservationKind("kind").notNull(),
    status: tripReservationStatus("status").notNull(),
    title: varchar("title", { length: 200 }).notNull(),
    providerName: varchar("provider_name", { length: 160 }),
    confirmationCode: varchar("confirmation_code", { length: 120 }),
    startDate: date("start_date").notNull(),
    startTime: time("start_time", { precision: 0 }),
    endDate: date("end_date"),
    endTime: time("end_time", { precision: 0 }),
    locationName: varchar("location_name", { length: 200 }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("trip_reservations_trip_idx").on(table.tripId),
    index("trip_reservations_itinerary_item_idx").on(table.itineraryItemId),
    index("trip_reservations_schedule_idx").on(
      table.tripId,
      table.startDate,
      table.startTime,
      table.createdAt,
      table.id,
    ),
    check(
      "trip_reservations_title_not_blank_check",
      sql`length(btrim(${table.title})) > 0`,
    ),
    check(
      "trip_reservations_provider_name_not_blank_check",
      sql`${table.providerName} is null or length(btrim(${table.providerName})) > 0`,
    ),
    check(
      "trip_reservations_confirmation_code_not_blank_check",
      sql`${table.confirmationCode} is null or length(btrim(${table.confirmationCode})) > 0`,
    ),
    check(
      "trip_reservations_location_name_not_blank_check",
      sql`${table.locationName} is null or length(btrim(${table.locationName})) > 0`,
    ),
    check(
      "trip_reservations_notes_length_check",
      sql`${table.notes} is null or length(${table.notes}) <= 5000`,
    ),
    check(
      "trip_reservations_end_time_date_check",
      sql`${table.endTime} is null or ${table.endDate} is not null`,
    ),
    check(
      "trip_reservations_date_range_check",
      sql`${table.endDate} is null or ${table.endDate} >= ${table.startDate}`,
    ),
    check(
      "trip_reservations_same_day_time_range_check",
      sql`${table.endDate} is null or ${table.endDate} <> ${table.startDate} or ${table.startTime} is null or ${table.endTime} is null or ${table.endTime} >= ${table.startTime}`,
    ),
  ],
);

export const reservationTransportDetails = pgTable(
  "reservation_transport_details",
  {
    reservationId: uuid("reservation_id")
      .notNull()
      .references(() => tripReservations.id, { onDelete: "cascade" }),
    mode: transportReservationMode("mode").notNull(),
    operatorName: varchar("operator_name", { length: 160 }),
    serviceNumber: varchar("service_number", { length: 120 }),
    originName: varchar("origin_name", { length: 200 }).notNull(),
    destinationName: varchar("destination_name", { length: 200 }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.reservationId] }),
    check(
      "reservation_transport_operator_not_blank_check",
      sql`${table.operatorName} is null or length(btrim(${table.operatorName})) > 0`,
    ),
    check(
      "reservation_transport_service_not_blank_check",
      sql`${table.serviceNumber} is null or length(btrim(${table.serviceNumber})) > 0`,
    ),
    check(
      "reservation_transport_origin_not_blank_check",
      sql`length(btrim(${table.originName})) > 0`,
    ),
    check(
      "reservation_transport_destination_not_blank_check",
      sql`length(btrim(${table.destinationName})) > 0`,
    ),
  ],
);
