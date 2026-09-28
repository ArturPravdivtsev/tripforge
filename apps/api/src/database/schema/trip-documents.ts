import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  index,
  pgEnum,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { itineraryItems } from "./itinerary-items";
import { searchVector } from "./search-vector";
import { tripExpenses } from "./trip-expenses";
import { tripReservations } from "./trip-reservations";
import { trips } from "./trips";
import { users } from "./users";

export const tripDocumentKind = pgEnum("trip_document_kind", [
  "ticket",
  "booking",
  "receipt",
  "image",
  "other",
]);

export const tripDocumentStatus = pgEnum("trip_document_status", [
  "pending",
  "ready",
]);

export const tripDocuments = pgTable(
  "trip_documents",
  {
    id: uuid("id").primaryKey(),
    tripId: uuid("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    itineraryItemId: uuid("itinerary_item_id").references(
      () => itineraryItems.id,
      { onDelete: "set null" },
    ),
    reservationId: uuid("reservation_id").references(
      () => tripReservations.id,
      { onDelete: "set null" },
    ),
    expenseId: uuid("expense_id").references(() => tripExpenses.id, {
      onDelete: "set null",
    }),
    kind: tripDocumentKind("kind").notNull(),
    status: tripDocumentStatus("status").default("pending").notNull(),
    title: varchar("title", { length: 200 }).notNull(),
    originalFileName: varchar("original_file_name", { length: 255 }).notNull(),
    searchVector: searchVector("search_vector").generatedAlwaysAs(
      sql`setweight(to_tsvector('simple'::regconfig, coalesce("title", '')), 'A') || setweight(to_tsvector('simple'::regconfig, coalesce("original_file_name", '')), 'B')`,
    ),
    contentType: varchar("content_type", { length: 64 }).notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    storageKey: varchar("storage_key", { length: 500 }).notNull(),
    etag: varchar("etag", { length: 255 }),
    uploadedByUserId: uuid("uploaded_by_user_id")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    readyAt: timestamp("ready_at", { withTimezone: true }),
  },
  (table) => [
    index("trip_documents_trip_created_idx").on(
      table.tripId,
      table.createdAt,
      table.id,
    ),
    index("trip_documents_itinerary_item_idx").on(table.itineraryItemId),
    index("trip_documents_reservation_idx").on(table.reservationId),
    index("trip_documents_expense_idx").on(table.expenseId),
    index("trip_documents_uploader_idx").on(table.uploadedByUserId),
    index("trip_documents_search_vector_idx")
      .using("gin", table.searchVector)
      .where(sql`${table.status} = 'ready'`),
    index("trip_documents_title_trgm_idx")
      .using("gin", table.title.op("gin_trgm_ops"))
      .where(sql`${table.status} = 'ready'`),
    index("trip_documents_file_name_trgm_idx")
      .using("gin", table.originalFileName.op("gin_trgm_ops"))
      .where(sql`${table.status} = 'ready'`),
    uniqueIndex("trip_documents_storage_key_unique").on(table.storageKey),
    check(
      "trip_documents_title_not_blank_check",
      sql`length(btrim(${table.title})) > 0`,
    ),
    check(
      "trip_documents_file_name_not_blank_check",
      sql`length(btrim(${table.originalFileName})) > 0`,
    ),
    check(
      "trip_documents_content_type_check",
      sql`${table.contentType} in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')`,
    ),
    check(
      "trip_documents_size_bytes_check",
      sql`${table.sizeBytes} >= 1 and ${table.sizeBytes} <= 26214400`,
    ),
    check(
      "trip_documents_link_exclusive_check",
      sql`num_nonnulls(${table.itineraryItemId}, ${table.reservationId}, ${table.expenseId}) <= 1`,
    ),
    check(
      "trip_documents_ready_state_check",
      sql`(${table.status} = 'pending' and ${table.readyAt} is null) or (${table.status} = 'ready' and ${table.readyAt} is not null)`,
    ),
  ],
);
