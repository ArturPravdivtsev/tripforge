import { Inject, Injectable } from "@nestjs/common";
import type {
  AuthUser,
  Trip,
  TripAccessRole,
  TripMemberRole,
  TripParticipant,
} from "@tripforge/contracts";
import {
  and,
  asc,
  count,
  desc,
  eq,
  exists,
  inArray,
  isNotNull,
  notInArray,
  or,
  sql,
} from "drizzle-orm";

import { DATABASE } from "../database/database.constants";
import type { Database } from "../database/database.provider";
import {
  itineraryItems,
  storageCleanupOutbox,
  tripDays,
  tripDocuments,
  tripMembers,
  trips,
  users,
} from "../database/schema";
import {
  writeAccessRevokedNotification,
  writeRoleChangedNotification,
  writeTripDeletedNotifications,
  writeTripSharedNotification,
} from "../notifications/notification-writer";

const tripSelection = {
  createdAt: trips.createdAt,
  endsOn: trips.endsOn,
  id: trips.id,
  name: trips.name,
  startsOn: trips.startsOn,
  updatedAt: trips.updatedAt,
};

type TripRow = {
  accessRole: TripAccessRole;
  createdAt: Date;
  endsOn: string | null;
  id: string;
  name: string;
  startsOn: string | null;
  updatedAt: Date;
};

type TripWrite = {
  endsOn?: string | null;
  name?: string;
  startsOn?: string | null;
};

export type TripAccess = Readonly<{
  ownerId: string;
  role: TripAccessRole;
}>;

export class TripDateChangeConflictError extends Error {}

function toTrip(row: TripRow): Trip {
  return {
    accessRole: row.accessRole,
    createdAt: row.createdAt.toISOString(),
    endsOn: row.endsOn,
    id: row.id,
    name: row.name,
    startsOn: row.startsOn,
    updatedAt: row.updatedAt.toISOString(),
  };
}

@Injectable()
export class TripsRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async create(
    ownerId: string,
    input: Required<TripWrite>,
    calendarDates: readonly string[],
  ): Promise<Trip> {
    return this.database.transaction(async (transaction) => {
      const [row] = await transaction
        .insert(trips)
        .values({ ownerId, ...input })
        .returning(tripSelection);

      if (!row) {
        throw new Error("Trip insert did not return a row");
      }

      if (calendarDates.length > 0) {
        await transaction.insert(tripDays).values(
          calendarDates.map((date) => ({ date, tripId: row.id })),
        );
      }

      return toTrip({ ...row, accessRole: "owner" });
    });
  }

  async findAccessibleById(
    userId: string,
    tripId: string,
  ): Promise<Trip | undefined> {
    const [row] = await this.database
      .select({
        ...tripSelection,
        accessRole: sql<TripAccessRole>`case
          when ${trips.ownerId} = ${userId} then 'owner'
          else ${tripMembers.role}::text
        end`,
      })
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
          eq(trips.id, tripId),
          or(eq(trips.ownerId, userId), isNotNull(tripMembers.userId)),
        ),
      )
      .limit(1);

    return row ? toTrip(row) : undefined;
  }

  async findAccess(userId: string, tripId: string): Promise<TripAccess | undefined> {
    const [row] = await this.database
      .select({
        ownerId: trips.ownerId,
        role: sql<TripAccessRole>`case
          when ${trips.ownerId} = ${userId} then 'owner'
          else ${tripMembers.role}::text
        end`,
      })
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
          eq(trips.id, tripId),
          or(eq(trips.ownerId, userId), isNotNull(tripMembers.userId)),
        ),
      )
      .limit(1);

    return row ?? undefined;
  }

  async listAccessible(
    userId: string,
    page: number,
    pageSize: number,
  ): Promise<{ items: Trip[]; total: number }> {
    const offset = (page - 1) * pageSize;
    const accessPredicate = or(
      eq(trips.ownerId, userId),
      isNotNull(tripMembers.userId),
    );
    const memberJoin = and(
      eq(tripMembers.tripId, trips.id),
      eq(tripMembers.userId, userId),
    );
    const [rows, totals] = await Promise.all([
      this.database
        .select({
          ...tripSelection,
          accessRole: sql<TripAccessRole>`case
            when ${trips.ownerId} = ${userId} then 'owner'
            else ${tripMembers.role}::text
          end`,
        })
        .from(trips)
        .leftJoin(tripMembers, memberJoin)
        .where(accessPredicate)
        .orderBy(desc(trips.createdAt), desc(trips.id))
        .limit(pageSize)
        .offset(offset),
      this.database
        .select({ total: count() })
        .from(trips)
        .leftJoin(tripMembers, memberJoin)
        .where(accessPredicate),
    ]);

    return {
      items: rows.map(toTrip),
      total: totals[0]?.total ?? 0,
    };
  }

  async updateAccessible(
    userId: string,
    tripId: string,
    input: TripWrite,
    calendarDates?: readonly string[],
  ): Promise<Trip | undefined> {
    return this.database.transaction(async (transaction) => {
      const editorAccess = exists(
        transaction
          .select({ value: sql`1` })
          .from(tripMembers)
          .where(
            and(
              eq(tripMembers.tripId, trips.id),
              eq(tripMembers.userId, userId),
              eq(tripMembers.role, "editor"),
            ),
          ),
      );
      const [authorized] = await transaction
        .select({ id: trips.id })
        .from(trips)
        .where(
          and(
            eq(trips.id, tripId),
            or(eq(trips.ownerId, userId), editorAccess),
          ),
        )
        .for("update")
        .limit(1);

      if (!authorized) return undefined;

      if (calendarDates !== undefined) {
        const removedDays = await transaction
          .select({ id: tripDays.id })
          .from(tripDays)
          .where(
            calendarDates.length === 0
              ? eq(tripDays.tripId, tripId)
              : and(
                  eq(tripDays.tripId, tripId),
                  notInArray(tripDays.date, [...calendarDates]),
                ),
          )
          .for("update");

        if (removedDays.length > 0) {
          const [populatedDay] = await transaction
            .select({ id: itineraryItems.id })
            .from(itineraryItems)
            .where(
              inArray(
                itineraryItems.tripDayId,
                removedDays.map(({ id }) => id),
              ),
            )
            .limit(1);

          if (populatedDay) throw new TripDateChangeConflictError();
        }
      }

      const [row] = await transaction
        .update(trips)
        .set({ ...input, updatedAt: new Date() })
        .where(
          and(
            eq(trips.id, tripId),
            or(eq(trips.ownerId, userId), editorAccess),
          ),
        )
        .returning({ ...tripSelection, ownerId: trips.ownerId });

      if (!row) return undefined;

      if (calendarDates !== undefined) {
        if (calendarDates.length === 0) {
          await transaction.delete(tripDays).where(eq(tripDays.tripId, tripId));
        } else {
          await transaction
            .delete(tripDays)
            .where(
              and(
                eq(tripDays.tripId, tripId),
                notInArray(tripDays.date, [...calendarDates]),
              ),
            );
          await transaction
            .insert(tripDays)
            .values(calendarDates.map((date) => ({ date, tripId })))
            .onConflictDoNothing({
              target: [tripDays.tripId, tripDays.date],
            });
        }
      }

      return toTrip({
        ...row,
        accessRole: row.ownerId === userId ? "owner" : "editor",
      });
    });
  }

  async deleteOwned(ownerId: string, tripId: string): Promise<string[] | undefined> {
    return this.database.transaction(async (transaction) => {
      const [owned] = await transaction
        .select({ id: trips.id })
        .from(trips)
        .where(and(eq(trips.id, tripId), eq(trips.ownerId, ownerId)))
        .for("update")
        .limit(1);
      if (!owned) return undefined;

      const notificationUserIds = await writeTripDeletedNotifications(
        transaction,
        tripId,
        ownerId,
      );

      const documents = await transaction
        .select({ storageKey: tripDocuments.storageKey })
        .from(tripDocuments)
        .where(eq(tripDocuments.tripId, tripId))
        .for("update");
      if (documents.length > 0) {
        await transaction
          .insert(storageCleanupOutbox)
          .values(
            documents.map(({ storageKey }) => ({
              reason: "trip_delete" as const,
              storageKey,
            })),
          )
          .onConflictDoNothing({ target: storageCleanupOutbox.storageKey });
      }

      const deleted = await transaction
        .delete(trips)
        .where(and(eq(trips.id, tripId), eq(trips.ownerId, ownerId)))
        .returning({ id: trips.id });
      return deleted.length > 0 ? notificationUserIds : undefined;
    });
  }

  async listParticipants(tripId: string): Promise<TripParticipant[] | undefined> {
    const [owner] = await this.database
      .select({
        displayName: users.displayName,
        email: users.email,
        id: users.id,
      })
      .from(trips)
      .innerJoin(users, eq(users.id, trips.ownerId))
      .where(eq(trips.id, tripId))
      .limit(1);

    if (!owner) {
      return undefined;
    }

    const members = await this.database
      .select({
        displayName: users.displayName,
        email: users.email,
        id: users.id,
        role: tripMembers.role,
      })
      .from(tripMembers)
      .innerJoin(users, eq(users.id, tripMembers.userId))
      .where(eq(tripMembers.tripId, tripId))
      .orderBy(
        asc(sql`coalesce(${users.displayName}, ${users.email})`),
        asc(users.email),
        asc(users.id),
      );

    return [
      { role: "owner", user: owner },
      ...members.map(({ role, ...user }) => ({ role, user })),
    ];
  }

  async findUserByEmail(email: string): Promise<AuthUser | undefined> {
    const [user] = await this.database
      .select({
        displayName: users.displayName,
        email: users.email,
        id: users.id,
      })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    return user;
  }

  async addMember(
    tripId: string,
    actorUserId: string,
    memberUserId: string,
    role: TripMemberRole,
  ): Promise<boolean> {
    return this.database.transaction(async (transaction) => {
      const inserted = await transaction
        .insert(tripMembers)
        .values({ role, tripId, userId: memberUserId })
        .onConflictDoNothing()
        .returning({ userId: tripMembers.userId });
      if (inserted.length === 0) return false;
      await writeTripSharedNotification(transaction, {
        actorUserId,
        recipientUserId: memberUserId,
        role,
        tripId,
      });
      return true;
    });
  }

  async updateMemberRole(
    tripId: string,
    actorUserId: string,
    memberUserId: string,
    role: TripMemberRole,
  ): Promise<{ changed: boolean; found: boolean }> {
    return this.database.transaction(async (transaction) => {
      const [current] = await transaction
        .select({ role: tripMembers.role })
        .from(tripMembers)
        .where(
          and(
            eq(tripMembers.tripId, tripId),
            eq(tripMembers.userId, memberUserId),
          ),
        )
        .for("update")
        .limit(1);
      if (!current) return { changed: false, found: false };
      if (current.role === role) return { changed: false, found: true };

      await transaction
        .update(tripMembers)
        .set({ role, updatedAt: new Date() })
        .where(
          and(
            eq(tripMembers.tripId, tripId),
            eq(tripMembers.userId, memberUserId),
          ),
        );
      await writeRoleChangedNotification(transaction, {
        actorUserId,
        nextRole: role,
        previousRole: current.role,
        recipientUserId: memberUserId,
        tripId,
      });
      return { changed: true, found: true };
    });
  }

  async removeMember(
    tripId: string,
    actorUserId: string,
    memberUserId: string,
  ): Promise<boolean> {
    return this.database.transaction(async (transaction) => {
      const [member] = await transaction
        .select({ userId: tripMembers.userId })
        .from(tripMembers)
        .where(
          and(
            eq(tripMembers.tripId, tripId),
            eq(tripMembers.userId, memberUserId),
          ),
        )
        .for("update")
        .limit(1);
      if (!member) return false;
      await writeAccessRevokedNotification(transaction, {
        actorUserId,
        recipientUserId: memberUserId,
        tripId,
      });
      await transaction
        .delete(tripMembers)
        .where(
          and(
            eq(tripMembers.tripId, tripId),
            eq(tripMembers.userId, memberUserId),
          ),
        );
      return true;
    });
  }
}
