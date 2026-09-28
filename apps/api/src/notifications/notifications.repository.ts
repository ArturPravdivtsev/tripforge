import { Inject, Injectable } from "@nestjs/common";
import type {
  NotificationPage,
  NotificationTarget,
  UserNotification,
  UserNotificationType,
} from "@tripforge/contracts";
import {
  and,
  count,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  lt,
  or,
  sql,
} from "drizzle-orm";

import { DATABASE } from "../database/database.constants";
import type { Database } from "../database/database.provider";
import {
  tripMembers,
  trips,
  userNotifications,
} from "../database/schema";
import {
  encodeNotificationCursor,
  type NotificationCursor,
} from "./notification-cursor";
import { parseNotificationPayload } from "./notification-payload";

const notificationSelection = {
  actorNameSnapshot: userNotifications.actorNameSnapshot,
  actorUserId: userNotifications.actorUserId,
  createdAt: userNotifications.createdAt,
  id: userNotifications.id,
  payload: userNotifications.payload,
  readAt: userNotifications.readAt,
  tripId: userNotifications.tripId,
  tripNameSnapshot: userNotifications.tripNameSnapshot,
  type: userNotifications.type,
};

type NotificationRow = {
  actorNameSnapshot: string | null;
  actorUserId: string | null;
  createdAt: Date;
  id: string;
  payload: unknown;
  readAt: Date | null;
  tripId: string | null;
  tripNameSnapshot: string;
  type: UserNotificationType;
};

@Injectable()
export class NotificationsRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async list(
    userId: string,
    limit: number,
    cursor?: NotificationCursor,
  ): Promise<NotificationPage> {
    const rows = await this.database
      .select(notificationSelection)
      .from(userNotifications)
      .where(
        and(
          eq(userNotifications.userId, userId),
          cursor
            ? or(
                lt(userNotifications.createdAt, new Date(cursor.createdAt)),
                and(
                  eq(userNotifications.createdAt, new Date(cursor.createdAt)),
                  lt(userNotifications.id, cursor.id),
                ),
              )
            : undefined,
        ),
      )
      .orderBy(desc(userNotifications.createdAt), desc(userNotifications.id))
      .limit(limit + 1);

    const hasNextPage = rows.length > limit;
    const pageRows = hasNextPage ? rows.slice(0, limit) : rows;
    const items = await this.toNotifications(userId, pageRows);
    const last = pageRows.at(-1);

    return {
      items,
      nextCursor:
        hasNextPage && last
          ? encodeNotificationCursor({
              createdAt: last.createdAt.toISOString(),
              id: last.id,
              v: 1,
            })
          : null,
    };
  }

  async unreadCount(userId: string): Promise<number> {
    const [row] = await this.database
      .select({ value: count() })
      .from(userNotifications)
      .where(
        and(
          eq(userNotifications.userId, userId),
          isNull(userNotifications.readAt),
        ),
      );
    return row?.value ?? 0;
  }

  async setReadState(
    userId: string,
    notificationId: string,
    read: boolean,
  ): Promise<UserNotification | undefined> {
    const [row] = await this.database
      .update(userNotifications)
      .set({
        readAt: read
          ? sql<Date>`coalesce(${userNotifications.readAt}, now())`
          : null,
      })
      .where(
        and(
          eq(userNotifications.id, notificationId),
          eq(userNotifications.userId, userId),
        ),
      )
      .returning(notificationSelection);
    if (!row) return undefined;
    const [notification] = await this.toNotifications(userId, [row]);
    return notification;
  }

  async markAllRead(userId: string): Promise<number> {
    const updated = await this.database
      .update(userNotifications)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(userNotifications.userId, userId),
          isNull(userNotifications.readAt),
        ),
      )
      .returning({ id: userNotifications.id });
    return updated.length;
  }

  private async toNotifications(
    userId: string,
    rows: NotificationRow[],
  ): Promise<UserNotification[]> {
    const tripIds = [
      ...new Set(
        rows
          .map(({ tripId }) => tripId)
          .filter((tripId): tripId is string => tripId !== null),
      ),
    ];
    const accessibleTripIds = new Set<string>();

    if (tripIds.length > 0) {
      const accessible = await this.database
        .select({ id: trips.id })
        .from(trips)
        .leftJoin(
          tripMembers,
          and(
            eq(tripMembers.tripId, trips.id),
            eq(tripMembers.userId, userId),
          ),
        )
        .where(
          and(
            inArray(trips.id, tripIds),
            or(eq(trips.ownerId, userId), isNotNull(tripMembers.userId)),
          ),
        );
      for (const trip of accessible) accessibleTripIds.add(trip.id);
    }

    return rows.map((row) => {
      const payload = parseNotificationPayload(row.payload, row.type);
      return {
        ...payload,
        actor:
          row.actorUserId !== null || row.actorNameSnapshot !== null
            ? {
                displayName: row.actorNameSnapshot,
                userId: row.actorUserId,
              }
            : null,
        createdAt: row.createdAt.toISOString(),
        id: row.id,
        readAt: row.readAt?.toISOString() ?? null,
        target:
          row.tripId && accessibleTripIds.has(row.tripId)
            ? targetFor(row.type, row.tripId)
            : null,
        trip: { id: row.tripId, name: row.tripNameSnapshot },
      } satisfies UserNotification;
    });
  }
}

function targetFor(
  type: UserNotificationType,
  tripId: string,
): NotificationTarget | null {
  switch (type) {
    case "trip_shared":
    case "trip_role_changed":
      return { tripId, type: "trip" };
    case "reservation_added":
      return { tripId, type: "reservations" };
    case "expense_added":
      return { tripId, type: "expenses" };
    case "document_ready":
      return { tripId, type: "documents" };
    case "trip_access_revoked":
    case "trip_deleted":
      return null;
  }
}
