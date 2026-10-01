import { afterEach, describe, expect, it, vi } from "vitest";

import type { SessionService } from "../auth/session/session.service";
import type { TripPermissionsService } from "../trips/trip-permissions.service";
import { SOCKET_MAX_HTTP_BUFFER_BYTES } from "./realtime.constants";
import { sessionRoom, tripRoom, userRoom } from "./realtime-rooms";
import { TripRealtimeGateway } from "./trip-realtime.gateway";
import { TripRealtimePublisher } from "./trip-realtime.publisher";
import { isAllowedSocketOrigin } from "./tripforge-io.adapter";

const TRIP_ID = "00000000-0000-4000-8000-000000000001";
const USER_ID = "00000000-0000-4000-8000-000000000002";
const SESSION_ID = "00000000-0000-4000-8000-000000000003";

afterEach(() => {
  vi.useRealTimers();
});

describe("realtime security and room helpers", () => {
  it("requires the exact configured Origin", () => {
    expect(
      isAllowedSocketOrigin("http://127.0.0.1:3000", "http://127.0.0.1:3000"),
    ).toBe(true);
    expect(
      isAllowedSocketOrigin("http://evil.example", "http://127.0.0.1:3000"),
    ).toBe(false);
    expect(isAllowedSocketOrigin(undefined, "http://127.0.0.1:3000")).toBe(
      false,
    );
  });

  it("uses stable internal room names", () => {
    expect(sessionRoom(SESSION_ID)).toBe(`session:${SESSION_ID}`);
    expect(userRoom(USER_ID)).toBe(`user:${USER_ID}`);
    expect(tripRoom(TRIP_ID)).toBe(`trip:${TRIP_ID}`);
  });
});

describe("TripRealtimeGateway", () => {
  function subject(
    session: ReturnType<typeof validSession> | null = validSession(),
  ) {
    let middleware:
      | ((client: ReturnType<typeof socket>, next: (error?: Error) => void) => void)
      | undefined;
    const sessions = {
      cookieName: vi.fn(() => "tripforge_session"),
      resolveSession: vi.fn().mockResolvedValue(session ?? undefined),
    };
    const permissions = {
      requireReadable: vi.fn().mockResolvedValue({ role: "editor" }),
    };
    const publisher = {
      attach: vi.fn(),
      publishPresence: vi.fn().mockResolvedValue(undefined),
    };
    const rateLimits = {
      increment: vi.fn().mockResolvedValue({ isBlocked: false }),
    };
    const logger = { event: vi.fn() };
    const metrics = {
      realtimeEvent: vi.fn(),
      realtimeJoin: vi.fn(),
      realtimeSocket: vi.fn(),
    };
    const gateway = new TripRealtimeGateway(
      sessions as unknown as SessionService,
      permissions as unknown as TripPermissionsService,
      publisher as unknown as TripRealtimePublisher,
      rateLimits as never,
      logger as never,
      metrics as never,
    );
    gateway.afterInit({
      use: vi.fn((value) => {
        middleware = value;
      }),
    } as never);

    return {
      gateway,
      middleware: () => middleware,
      metrics,
      permissions,
      publisher,
      rateLimits,
      sessions,
    };
  }

  it("authenticates from the opaque cookie and joins session/user rooms", async () => {
    const { gateway, metrics, middleware, sessions } = subject();
    const client = socket("tripforge_session=opaque-token");

    await runMiddleware(middleware(), client);
    await gateway.handleConnection(client as never);

    expect(sessions.resolveSession).toHaveBeenCalledWith("opaque-token");
    expect(client.join).toHaveBeenCalledWith([
      sessionRoom(SESSION_ID),
      userRoom(USER_ID),
    ]);
    expect(client.data).toMatchObject({
      displayName: "Artur",
      sessionId: SESSION_ID,
      userId: USER_ID,
    });
    expect(metrics.realtimeSocket).toHaveBeenCalledWith(1, "connected");
  });

  it("rejects a missing or invalid session with a stable connect error", async () => {
    const missingCookie = subject();
    await expect(
      runMiddleware(missingCookie.middleware(), socket(undefined)),
    ).rejects.toMatchObject({
      data: { code: "AUTHENTICATION_REQUIRED" },
      message: "Authentication is required",
    });

    const invalidSession = subject(null);
    await expect(
      runMiddleware(
        invalidSession.middleware(),
        socket("tripforge_session=invalid"),
      ),
    ).rejects.toMatchObject({ data: { code: "AUTHENTICATION_REQUIRED" } });
  });

  it("validates Trip UUID before DB access and authorizes every join", async () => {
    const { gateway, permissions, publisher } = subject();
    const client = socket();
    client.data = socketData();

    await expect(
      gateway.joinTrip(client as never, { tripId: "not-a-uuid" }),
    ).resolves.toMatchObject({ error: { code: "INVALID_TRIP_ID" }, ok: false });
    expect(permissions.requireReadable).not.toHaveBeenCalled();

    await expect(
      gateway.joinTrip(client as never, { tripId: TRIP_ID }),
    ).resolves.toEqual({ accessRole: "editor", ok: true });
    expect(permissions.requireReadable).toHaveBeenCalledWith(USER_ID, TRIP_ID);
    expect(client.join).toHaveBeenCalledWith(tripRoom(TRIP_ID));
    expect(publisher.publishPresence).toHaveBeenCalledWith(TRIP_ID);
  });

  it("disconnects when the absolute session expiry is reached", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    const { gateway } = subject({
      ...validSession(),
      expiresAt: new Date(Date.now() + 1_000),
    });
    const client = socket();
    client.data = { ...socketData(), sessionExpiresAt: Date.now() + 1_000 };

    await gateway.handleConnection(client as never);
    await vi.advanceTimersByTimeAsync(1_000);

    expect(client.disconnect).toHaveBeenCalledWith(true);
  });

  it("rate limits client-originated joins without exposing bucket details", async () => {
    const { gateway, metrics, rateLimits } = subject();
    const client = socket();
    client.data = socketData();
    rateLimits.increment.mockResolvedValue({ isBlocked: true });

    await expect(
      gateway.joinTrip(client as never, { tripId: TRIP_ID }),
    ).resolves.toEqual({
      error: {
        code: "RATE_LIMITED",
        message: "Too many realtime requests. Please try again later.",
      },
      ok: false,
    });
    expect(metrics.realtimeEvent).toHaveBeenCalledWith("join_rejected");
  });

  it("bounds Socket.IO payloads to 64 KiB", () => {
    expect(SOCKET_MAX_HTTP_BUFFER_BYTES).toBe(65_536);
  });
});

describe("TripRealtimePublisher", () => {
  it("emits minimal invalidations and performs server-side eviction", () => {
    const emit = vi.fn();
    const socketsLeave = vi.fn();
    const disconnectSockets = vi.fn();
    const operator = {
      disconnectSockets,
      emit,
      fetchSockets: vi.fn().mockResolvedValue([]),
      socketsLeave,
    };
    const server = {
      in: vi.fn(() => operator),
      to: vi.fn(() => operator),
    };
    const publisher = new TripRealtimePublisher();
    publisher.attach(server as never);

    publisher.invalidate(TRIP_ID, ["members", "members", "trip"]);
    publisher.accessRevoked(TRIP_ID, USER_ID);
    publisher.tripDeleted(TRIP_ID);
    publisher.disconnectSession(SESSION_ID);

    expect(emit).toHaveBeenCalledWith("trip:invalidate", {
      resources: ["members", "trip"],
      tripId: TRIP_ID,
    });
    expect(server.in).toHaveBeenCalledWith(userRoom(USER_ID));
    expect(socketsLeave).toHaveBeenCalledWith(tripRoom(TRIP_ID));
    expect(disconnectSockets).toHaveBeenCalledWith(true);
  });

  it("deduplicates and deterministically orders cross-node presence", async () => {
    const emit = vi.fn();
    const operator = {
      emit,
      fetchSockets: vi.fn().mockResolvedValue([
        { data: { displayName: "Zed", userId: USER_ID } },
        { data: { displayName: "Zed", userId: USER_ID } },
        {
          data: {
            displayName: "Anna",
            userId: "00000000-0000-4000-8000-000000000001",
          },
        },
      ]),
    };
    const server = { in: vi.fn(() => operator), to: vi.fn(() => operator) };
    const publisher = new TripRealtimePublisher();
    publisher.attach(server as never);

    await publisher.publishPresence(TRIP_ID);

    expect(emit).toHaveBeenCalledWith("trip:presence", {
      tripId: TRIP_ID,
      users: [
        {
          displayName: "Anna",
          userId: "00000000-0000-4000-8000-000000000001",
        },
        { displayName: "Zed", userId: USER_ID },
      ],
    });
  });
});

function validSession() {
  return {
    displayName: "Artur",
    email: "artur@example.com",
    expiresAt: new Date(Date.now() + 60_000),
    id: USER_ID,
    sessionId: SESSION_ID,
  };
}

function socket(cookie?: string) {
  return {
    data: {} as ReturnType<typeof socketData>,
    disconnect: vi.fn(),
    handshake: { headers: { cookie } },
    id: "socket-1",
    join: vi.fn().mockResolvedValue(undefined),
    leave: vi.fn().mockResolvedValue(undefined),
  };
}

function socketData() {
  return {
    displayName: "Artur",
    joinedTripIds: [] as string[],
    sessionExpiresAt: Date.now() + 60_000,
    sessionId: SESSION_ID,
    userId: USER_ID,
  };
}

async function runMiddleware(
  middleware: ((client: ReturnType<typeof socket>, next: (error?: Error) => void) => void) | undefined,
  client: ReturnType<typeof socket>,
): Promise<void> {
  if (!middleware) throw new Error("Socket middleware was not registered");
  await new Promise<void>((resolve, reject) => {
    middleware(client, (error) => (error ? reject(error) : resolve()));
  });
}
