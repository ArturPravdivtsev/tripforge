import { Injectable, Logger } from "@nestjs/common";
import {
  NOTIFICATION_REALTIME_EVENTS,
  TRIP_REALTIME_EVENTS,
  type NotificationsInvalidateEvent,
  type TripAccessRevokedEvent,
  type TripDeletedEvent,
  type TripInvalidateEvent,
  type TripPresenceEvent,
  type TripPresenceUser,
  type TripRealtimeResource,
} from "@tripforge/contracts";
import type { Server } from "socket.io";

import { sessionRoom, tripRoom, userRoom } from "./realtime-rooms";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketData,
} from "./realtime.types";

type RealtimeServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

@Injectable()
export class TripRealtimePublisher {
  private readonly logger = new Logger(TripRealtimePublisher.name);
  private server?: RealtimeServer;

  attach(server: RealtimeServer): void {
    this.server = server;
  }

  invalidate(tripId: string, resources: readonly TripRealtimeResource[]): void {
    const payload: TripInvalidateEvent = {
      resources: [...new Set(resources)],
      tripId,
    };

    this.publish(() => {
      this.server?.to(tripRoom(tripId)).emit(TRIP_REALTIME_EVENTS.invalidate, payload);
    }, TRIP_REALTIME_EVENTS.invalidate, tripId);
  }

  tripDeleted(tripId: string): void {
    const payload: TripDeletedEvent = { tripId };

    this.publish(() => {
      const room = this.server?.in(tripRoom(tripId));
      room?.emit(TRIP_REALTIME_EVENTS.deleted, payload);
      room?.socketsLeave(tripRoom(tripId));
    }, TRIP_REALTIME_EVENTS.deleted, tripId);
  }

  accessRevoked(tripId: string, userId: string): void {
    const payload: TripAccessRevokedEvent = { tripId };

    this.publish(() => {
      const target = this.server?.in(userRoom(userId));
      target?.emit(TRIP_REALTIME_EVENTS.accessRevoked, payload);
      target?.socketsLeave(tripRoom(tripId));
      setTimeout(() => void this.publishPresence(tripId), 0);
    }, TRIP_REALTIME_EVENTS.accessRevoked, tripId);
  }

  disconnectSession(sessionId: string): void {
    this.publish(() => {
      this.server?.in(sessionRoom(sessionId)).disconnectSockets(true);
    }, "session:disconnect");
  }

  notificationsChanged(userIds: readonly string[]): void {
    const payload: NotificationsInvalidateEvent = {};

    for (const userId of new Set(userIds)) {
      this.publish(() => {
        this.server
          ?.to(userRoom(userId))
          .emit(NOTIFICATION_REALTIME_EVENTS.invalidate, payload);
      }, NOTIFICATION_REALTIME_EVENTS.invalidate);
    }
  }

  async publishPresence(tripId: string): Promise<void> {
    if (!this.server) {
      return;
    }

    try {
      const sockets = await this.server.in(tripRoom(tripId)).fetchSockets();
      const usersById = new Map<string, TripPresenceUser>();

      for (const socket of sockets) {
        const { displayName, userId } = socket.data;
        if (userId) {
          usersById.set(userId, { displayName: displayName ?? null, userId });
        }
      }

      const payload: TripPresenceEvent = {
        tripId,
        users: [...usersById.values()].sort((left, right) =>
          left.userId.localeCompare(right.userId, "en"),
        ),
      };
      this.server.to(tripRoom(tripId)).emit(TRIP_REALTIME_EVENTS.presence, payload);
    } catch {
      this.logger.warn(`Presence refresh failed tripId=${tripId}`);
    }
  }

  private publish(action: () => void, event: string, tripId?: string): void {
    try {
      action();
    } catch {
      this.logger.warn(
        `Realtime publish failed event=${event}${tripId ? ` tripId=${tripId}` : ""}`,
      );
    }
  }
}
