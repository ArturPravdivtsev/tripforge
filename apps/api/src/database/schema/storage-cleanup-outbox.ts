import { sql } from "drizzle-orm";
import {
  check,
  index,
  pgEnum,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const storageCleanupReason = pgEnum("storage_cleanup_reason", [
  "document_delete",
  "trip_delete",
  "stale_pending",
]);

export const storageCleanupOutbox = pgTable(
  "storage_cleanup_outbox",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    storageKey: varchar("storage_key", { length: 500 }).notNull(),
    reason: storageCleanupReason("reason").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    lastDispatchedAt: timestamp("last_dispatched_at", { withTimezone: true }),
    failedAt: timestamp("failed_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("storage_cleanup_outbox_storage_key_unique").on(
      table.storageKey,
    ),
    index("storage_cleanup_outbox_incomplete_created_idx")
      .on(table.createdAt, table.id)
      .where(sql`${table.completedAt} is null`),
    check(
      "storage_cleanup_outbox_storage_key_not_blank_check",
      sql`length(btrim(${table.storageKey})) > 0`,
    ),
    check(
      "storage_cleanup_outbox_terminal_state_check",
      sql`${table.completedAt} is null or ${table.failedAt} is null`,
    ),
  ],
);
