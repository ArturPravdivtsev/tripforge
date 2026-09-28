import type {
  NotificationPayload,
  TripMemberRole,
  UserNotificationType,
} from "@tripforge/contracts";
import { eq } from "drizzle-orm";

import type { Database } from "../database/database.provider";
import {
  tripMembers,
  trips,
  userNotifications,
  users,
} from "../database/schema";

export type DatabaseTransaction = Parameters<
  Parameters<Database["transaction"]>[0]
>[0];

type TripContext = Readonly<{
  actorName: string | null;
  ownerId: string;
  tripName: string;
}>;

type ActivityType = "reservation_added" | "expense_added" | "document_ready";

export async function writeTripSharedNotification(
  transaction: DatabaseTransaction,
  input: Readonly<{
    actorUserId: string;
    recipientUserId: string;
    role: TripMemberRole;
    tripId: string;
  }>,
): Promise<void> {
  const context = await loadContext(transaction, input.tripId, input.actorUserId);
  await insertNotifications(transaction, context, input.actorUserId, input.tripId, [
    {
      payload: { type: "trip_shared", data: { role: input.role } },
      userId: input.recipientUserId,
    },
  ]);
}

export async function writeRoleChangedNotification(
  transaction: DatabaseTransaction,
  input: Readonly<{
    actorUserId: string;
    nextRole: TripMemberRole;
    previousRole: TripMemberRole;
    recipientUserId: string;
    tripId: string;
  }>,
): Promise<void> {
  const context = await loadContext(transaction, input.tripId, input.actorUserId);
  await insertNotifications(transaction, context, input.actorUserId, input.tripId, [
    {
      payload: {
        type: "trip_role_changed",
        data: { nextRole: input.nextRole, previousRole: input.previousRole },
      },
      userId: input.recipientUserId,
    },
  ]);
}

export async function writeAccessRevokedNotification(
  transaction: DatabaseTransaction,
  input: Readonly<{
    actorUserId: string;
    recipientUserId: string;
    tripId: string;
  }>,
): Promise<void> {
  const context = await loadContext(transaction, input.tripId, input.actorUserId);
  await insertNotifications(transaction, context, input.actorUserId, input.tripId, [
    {
      payload: { type: "trip_access_revoked", data: {} },
      userId: input.recipientUserId,
    },
  ]);
}

export async function writeTripDeletedNotifications(
  transaction: DatabaseTransaction,
  tripId: string,
  actorUserId: string,
): Promise<string[]> {
  const context = await loadContext(transaction, tripId, actorUserId);
  const recipientUserIds = await loadMemberIds(transaction, tripId);
  await insertNotifications(
    transaction,
    context,
    actorUserId,
    tripId,
    recipientUserIds.map((userId) => ({
      payload: { type: "trip_deleted", data: {} },
      userId,
    })),
  );
  return recipientUserIds;
}

export async function writeActivityNotifications(
  transaction: DatabaseTransaction,
  input: Readonly<{
    actorUserId: string;
    title: string;
    tripId: string;
    type: ActivityType;
  }>,
): Promise<string[]> {
  const context = await loadContext(transaction, input.tripId, input.actorUserId);
  const memberIds = await loadMemberIds(transaction, input.tripId);
  const recipientUserIds = [...new Set([context.ownerId, ...memberIds])].filter(
    (userId) => userId !== input.actorUserId,
  );
  await insertNotifications(
    transaction,
    context,
    input.actorUserId,
    input.tripId,
    recipientUserIds.map((userId) => ({
      payload: { type: input.type, data: { title: input.title } },
      userId,
    })),
  );
  return recipientUserIds;
}

async function loadContext(
  transaction: DatabaseTransaction,
  tripId: string,
  actorUserId: string,
): Promise<TripContext> {
  const [row] = await transaction
    .select({
      actorName: users.displayName,
      ownerId: trips.ownerId,
      tripName: trips.name,
    })
    .from(trips)
    .innerJoin(users, eq(users.id, actorUserId))
    .where(eq(trips.id, tripId))
    .limit(1);
  if (!row) throw new Error("Notification Trip context is unavailable");
  return row;
}

async function loadMemberIds(
  transaction: DatabaseTransaction,
  tripId: string,
): Promise<string[]> {
  const rows = await transaction
    .select({ userId: tripMembers.userId })
    .from(tripMembers)
    .where(eq(tripMembers.tripId, tripId));
  return rows.map(({ userId }) => userId);
}

async function insertNotifications(
  transaction: DatabaseTransaction,
  context: TripContext,
  actorUserId: string,
  tripId: string,
  notifications: readonly Readonly<{
    payload: NotificationPayload;
    userId: string;
  }>[],
): Promise<void> {
  if (notifications.length === 0) return;
  await transaction.insert(userNotifications).values(
    notifications.map(({ payload, userId }) => ({
      actorNameSnapshot: context.actorName,
      actorUserId,
      payload,
      tripId,
      tripNameSnapshot: context.tripName,
      type: payload.type as UserNotificationType,
      userId,
    })),
  );
}
