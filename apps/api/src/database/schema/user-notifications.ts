import type { NotificationPayload } from "@tripforge/contracts";
import { sql } from "drizzle-orm";
import {
  check,
  index,
  jsonb,
  pgEnum,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { trips } from "./trips";
import { users } from "./users";

export const userNotificationType = pgEnum("user_notification_type", [
  "trip_shared",
  "trip_role_changed",
  "trip_access_revoked",
  "trip_deleted",
  "reservation_added",
  "expense_added",
  "document_ready",
]);

export const userNotifications = pgTable(
  "user_notifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: userNotificationType("type").notNull(),
    tripId: uuid("trip_id").references(() => trips.id, {
      onDelete: "set null",
    }),
    tripNameSnapshot: varchar("trip_name_snapshot", { length: 200 }).notNull(),
    actorUserId: uuid("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    actorNameSnapshot: varchar("actor_name_snapshot", { length: 100 }),
    payload: jsonb("payload").$type<NotificationPayload>().notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("user_notifications_inbox_idx").on(
      table.userId,
      table.createdAt.desc(),
      table.id.desc(),
    ),
    index("user_notifications_unread_idx")
      .on(table.userId)
      .where(sql`${table.readAt} is null`),
    index("user_notifications_trip_id_idx").on(table.tripId),
    index("user_notifications_actor_user_id_idx").on(table.actorUserId),
    check(
      "user_notifications_trip_name_not_blank_check",
      sql`length(btrim(${table.tripNameSnapshot})) > 0`,
    ),
    check(
      "user_notifications_actor_name_not_blank_check",
      sql`${table.actorNameSnapshot} is null or length(btrim(${table.actorNameSnapshot})) > 0`,
    ),
    check(
      "user_notifications_payload_object_check",
      sql`jsonb_typeof(${table.payload}) = 'object'`,
    ),
  ],
);
