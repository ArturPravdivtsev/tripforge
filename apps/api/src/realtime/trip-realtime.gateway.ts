import { HttpException } from "@nestjs/common";
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import {
  TRIP_REALTIME_EVENTS,
  type TripJoinRequest,
  type TripJoinResponse,
  type TripLeaveRequest,
  type TripLeaveResponse,
} from "@tripforge/contracts";
import type { Server, Socket } from "socket.io";

import { SessionService } from "../auth/session/session.service";
import { AppLogger } from "../observability/app-logger.service";
import { ObservabilityMetrics } from "../observability/metrics.service";
import { RedisThrottlerStorage } from "../security/redis-throttler.storage";
import { TripPermissionsService } from "../trips/trip-permissions.service";
import {
  MAX_SESSION_TIMER_MS,
  SOCKET_AUTH_ERROR,
} from "./realtime.constants";
import { sessionRoom, tripRoom, userRoom } from "./realtime-rooms";
import { TripRealtimePublisher } from "./trip-realtime.publisher";
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
type RealtimeSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@WebSocketGateway()
export class TripRealtimeGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly expiryTimers = new Map<string, NodeJS.Timeout>();

  @WebSocketServer()
  private server!: RealtimeServer;

  constructor(
    private readonly sessionService: SessionService,
    private readonly tripPermissions: TripPermissionsService,
    private readonly publisher: TripRealtimePublisher,
    private readonly rateLimits: RedisThrottlerStorage,
    private readonly logger: AppLogger = new AppLogger(),
    private readonly metrics: ObservabilityMetrics = new ObservabilityMetrics(),
  ) {}

  afterInit(server: RealtimeServer): void {
    this.publisher.attach(server);
    server.use((socket, next) => {
      void this.authenticate(socket)
        .then(() => next())
        .catch(() => {
          this.metrics.realtimeEvent("connection_rejected");
          this.logger.event("warn", "realtime.connection.rejected", {
            reason: "authentication",
          });
          const error = new Error(SOCKET_AUTH_ERROR.message) as Error & {
            data?: typeof SOCKET_AUTH_ERROR;
          };
          error.data = SOCKET_AUTH_ERROR;
          next(error);
        });
    });
  }

  async handleConnection(socket: RealtimeSocket): Promise<void> {
    await socket.join([
      sessionRoom(socket.data.sessionId),
      userRoom(socket.data.userId),
    ]);
    this.scheduleExpiry(socket);
    this.metrics.realtimeSocket(1, "connected");
    this.logger.event("info", "realtime.socket.connected");
  }

  handleDisconnect(socket: RealtimeSocket, reason?: string): void {
    const timer = this.expiryTimers.get(socket.id);
    if (timer) {
      clearTimeout(timer);
      this.expiryTimers.delete(socket.id);
    }
    for (const tripId of socket.data.joinedTripIds ?? []) {
      void this.publisher.publishPresence(tripId);
    }
    const joinedTrips = socket.data.joinedTripIds?.length ?? 0;
    for (let index = 0; index < joinedTrips; index += 1) {
      this.metrics.realtimeJoin(-1);
    }
    this.metrics.realtimeSocket(-1, "disconnected");
    this.logger.event("info", "realtime.socket.disconnected", {
      reason: normalizeDisconnectReason(reason),
    });
  }

  @SubscribeMessage(TRIP_REALTIME_EVENTS.join)
  async joinTrip(
    @ConnectedSocket() socket: RealtimeSocket,
    @MessageBody() payload: TripJoinRequest,
  ): Promise<TripJoinResponse> {
    if (!(await this.allowRealtimeEvent(socket, "join", 20))) {
      this.metrics.realtimeEvent("join_rejected");
      return {
        error: {
          code: "RATE_LIMITED",
          message: "Too many realtime requests. Please try again later.",
        },
        ok: false,
      };
    }
    if (!this.validTripId(payload)) {
      this.metrics.realtimeEvent("join_rejected");
      return {
        error: { code: "INVALID_TRIP_ID", message: "Trip ID must be a UUID" },
        ok: false,
      };
    }

    try {
      const access = await this.tripPermissions.requireReadable(
        socket.data.userId,
        payload.tripId,
      );
      await socket.join(tripRoom(payload.tripId));
      const newJoin = !socket.data.joinedTripIds.includes(payload.tripId);
      if (newJoin) {
        socket.data.joinedTripIds.push(payload.tripId);
        this.metrics.realtimeJoin(1);
      }
      await this.publisher.publishPresence(payload.tripId);

      return { accessRole: access.role, ok: true };
    } catch (error) {
      if (error instanceof HttpException) {
        this.metrics.realtimeEvent("join_rejected");
        return {
          error: {
            code: "TRIP_ACCESS_DENIED",
            message: "Trip access is unavailable",
          },
          ok: false,
        };
      }

      this.metrics.realtimeEvent("join_rejected");
      this.logger.event("error", "realtime.join.failed", {
        errorType: error instanceof Error ? error.name : "unknown",
      });
      return {
        error: { code: "INTERNAL_ERROR", message: "Unable to join Trip" },
        ok: false,
      };
    }
  }

  @SubscribeMessage(TRIP_REALTIME_EVENTS.leave)
  async leaveTrip(
    @ConnectedSocket() socket: RealtimeSocket,
    @MessageBody() payload: TripLeaveRequest,
  ): Promise<TripLeaveResponse> {
    if (!(await this.allowRealtimeEvent(socket, "leave", 60))) {
      return {
        error: {
          code: "RATE_LIMITED",
          message: "Too many realtime requests. Please try again later.",
        },
        ok: false,
      };
    }
    if (!this.validTripId(payload)) {
      return {
        error: { code: "INVALID_TRIP_ID", message: "Trip ID must be a UUID" },
        ok: false,
      };
    }

    const wasJoined = socket.data.joinedTripIds.includes(payload.tripId);
    await socket.leave(tripRoom(payload.tripId));
    socket.data.joinedTripIds = socket.data.joinedTripIds.filter(
      (tripId) => tripId !== payload.tripId,
    );
    if (wasJoined) this.metrics.realtimeJoin(-1);
    await this.publisher.publishPresence(payload.tripId);
    return { ok: true };
  }

  private async authenticate(socket: RealtimeSocket): Promise<void> {
    const token = this.readCookie(
      socket.handshake.headers.cookie,
      this.sessionService.cookieName(),
    );
    if (!token) {
      throw new Error(SOCKET_AUTH_ERROR.code);
    }

    const session = await this.sessionService.resolveSession(token);
    if (!session) {
      throw new Error(SOCKET_AUTH_ERROR.code);
    }

    socket.data = {
      displayName: session.displayName,
      joinedTripIds: [],
      sessionExpiresAt: session.expiresAt.getTime(),
      sessionId: session.sessionId,
      userId: session.id,
    };
  }

  private async allowRealtimeEvent(
    socket: RealtimeSocket,
    event: "join" | "leave",
    limit: number,
  ): Promise<boolean> {
    try {
      const result = await this.rateLimits.increment(
        `realtime:${event}:user:${socket.data.userId}`,
        60_000,
        limit,
        60_000,
        `realtime-${event}`,
      );
      return !result.isBlocked;
    } catch {
      // Joining is authorization-sensitive; leaving remains available for cleanup.
      return event === "leave";
    }
  }

  private readCookie(header: string | undefined, name: string): string | undefined {
    for (const entry of header?.split(";") ?? []) {
      const separator = entry.indexOf("=");
      if (separator < 0 || entry.slice(0, separator).trim() !== name) {
        continue;
      }
      try {
        return decodeURIComponent(entry.slice(separator + 1).trim());
      } catch {
        return undefined;
      }
    }
    return undefined;
  }

  private scheduleExpiry(socket: RealtimeSocket): void {
    const remaining = socket.data.sessionExpiresAt - Date.now();
    if (remaining <= 0) {
      socket.disconnect(true);
      return;
    }

    const timer = setTimeout(() => {
      this.expiryTimers.delete(socket.id);
      this.scheduleExpiry(socket);
    }, Math.min(remaining, MAX_SESSION_TIMER_MS));
    timer.unref();
    this.expiryTimers.set(socket.id, timer);
  }

  private validTripId(payload: unknown): payload is { tripId: string } {
    return (
      typeof payload === "object" &&
      payload !== null &&
      typeof (payload as { tripId?: unknown }).tripId === "string" &&
      UUID_PATTERN.test((payload as { tripId: string }).tripId)
    );
  }
}

function normalizeDisconnectReason(reason: string | undefined): string {
  const allowed = new Set([
    "client namespace disconnect",
    "server namespace disconnect",
    "ping timeout",
    "transport close",
    "transport error",
  ]);
  return reason && allowed.has(reason) ? reason : "other";
}
