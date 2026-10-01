import { resolve } from "node:path";

import { type INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import {
  RedisContainer,
  type StartedRedisContainer,
} from "@testcontainers/redis";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import Redis from "ioredis";
import { Pool } from "pg";
import { io, type Socket } from "socket.io-client";
import request, { type Response } from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "../src/realtime/realtime.types";
import { TripForgeIoAdapter } from "../src/realtime/tripforge-io.adapter";
import { configureApplication } from "../src/common/configure-application";

const PASSWORD = "a sufficiently long password";
const WEB_ORIGIN = "http://127.0.0.1:3000";
const EVIL_ORIGIN = "http://evil.example";

type RealtimeClient = Socket<ServerToClientEvents, ClientToServerEvents>;
type Identity = { cookie: string; email: string; id: string };

describe("Socket.IO collaboration with PostgreSQL and Redis Streams", () => {
  let apiA: INestApplication;
  let apiB: INestApplication;
  let databaseUrl: string;
  let pool: Pool;
  let postgres: StartedPostgreSqlContainer;
  let redis: StartedRedisContainer;
  let redisUrl: string;

  beforeAll(async () => {
    [postgres, redis] = await Promise.all([
      new PostgreSqlContainer("postgres:18.6-bookworm")
        .withDatabase("tripforge")
        .withUsername("tripforge")
        .withPassword("tripforge")
        .start(),
      new RedisContainer("redis:8.10.1-alpine").start(),
    ]);
    databaseUrl = postgres.getConnectionUri();
    redisUrl = redis.getConnectionUrl();
    const migrationPool = new Pool({ connectionString: databaseUrl });
    await migrate(drizzle(migrationPool), {
      migrationsFolder: resolve(process.cwd(), "drizzle"),
    });
    await migrationPool.end();

    process.env.DATABASE_URL = databaseUrl;
    process.env.NODE_ENV = "test";
    process.env.REDIS_URL = redisUrl;
    process.env.SECURITY_RATE_LIMITING_ENABLED = "true";
    process.env.WEB_ORIGIN = WEB_ORIGIN;

    const { AppModule } = await import("../src/app.module");
    [apiA, apiB] = await Promise.all([
      createApplication(AppModule),
      createApplication(AppModule),
    ]);
    pool = new Pool({ connectionString: databaseUrl });
  });

  beforeEach(async () => {
    await pool.query(
      "TRUNCATE TABLE auth_sessions, password_credentials, trips, users CASCADE",
    );
    const client = new Redis(redisUrl);
    await client.flushdb();
    await client.quit();
  });

  afterAll(async () => {
    await Promise.all([apiA?.close(), apiB?.close()]);
    await pool?.end();
    await Promise.all([postgres?.stop(), redis?.stop()]);
  });

  it("enforces Origin/auth/room authorization and broadcasts across nodes", async () => {
    const owner = await register(apiA, "owner@example.com", "Owner");
    const editor = await register(apiA, "editor@example.com", "Editor");
    const outsider = await register(apiA, "outsider@example.com", "Outsider");
    const tripId = await createTrip(apiA, owner, "Japan");
    await addMember(apiA, owner, tripId, editor.email, "editor");

    await expectRejectedConnection(apiA, owner.cookie, EVIL_ORIGIN);
    await expectRejectedConnection(apiA, undefined, WEB_ORIGIN);

    const ownerSocket = await connect(apiA, owner.cookie);
    const editorSocket = await connect(apiB, editor.cookie);
    const outsiderSocket = await connect(apiB, outsider.cookie);
    try {
      await expect(join(outsiderSocket, tripId)).resolves.toMatchObject({
        error: { code: "TRIP_ACCESS_DENIED" },
        ok: false,
      });
      await expect(join(ownerSocket, tripId)).resolves.toEqual({
        accessRole: "owner",
        ok: true,
      });

      const presence = waitForEvent(editorSocket, "trip:presence");
      await expect(join(editorSocket, tripId)).resolves.toEqual({
        accessRole: "editor",
        ok: true,
      });
      await expect(presence).resolves.toMatchObject({
        tripId,
        users: expect.arrayContaining([
          { displayName: "Owner", userId: owner.id },
          { displayName: "Editor", userId: editor.id },
        ]),
      });

      const duplicateOwner = await connect(apiB, owner.cookie);
      try {
        const deduplicated = waitForEvent(editorSocket, "trip:presence");
        await join(duplicateOwner, tripId);
        const snapshot = await deduplicated;
        expect(snapshot.users.filter(({ userId }) => userId === owner.id)).toHaveLength(1);
      } finally {
        const afterDuplicateDisconnect = waitForEvent(
          editorSocket,
          "trip:presence",
        );
        duplicateOwner.disconnect();
        await expect(afterDuplicateDisconnect).resolves.toMatchObject({
          users: expect.arrayContaining([
            expect.objectContaining({ userId: owner.id }),
          ]),
        });
      }

      const invalidation = waitForEvent(editorSocket, "trip:invalidate");
      const update = await browserPatch(apiA, `/api/trips/${tripId}`, owner.cookie)
        .send({ name: "Japan updated" });
      expect(update.status).toBe(200);
      await expect(invalidation).resolves.toMatchObject({
        resources: ["trip"],
        tripId,
      });

      const ownerLeft = waitForEvent(editorSocket, "trip:presence");
      ownerSocket.disconnect();
      await expect(ownerLeft).resolves.toMatchObject({
        tripId,
        users: [{ displayName: "Editor", userId: editor.id }],
      });

      editorSocket.disconnect();
      const reconnected = await connect(apiB, editor.cookie);
      try {
        await expect(join(reconnected, tripId)).resolves.toEqual({
          accessRole: "editor",
          ok: true,
        });
      } finally {
        reconnected.disconnect();
      }
    } finally {
      ownerSocket.disconnect();
      editorSocket.disconnect();
      outsiderSocket.disconnect();
    }
  });

  it("propagates role changes, revocation, deletion, and logout across nodes", async () => {
    const owner = await register(apiA, "owner@example.com", "Owner");
    const member = await register(apiA, "member@example.com", "Member");
    const tripId = await createTrip(apiA, owner, "Japan");
    await addMember(apiA, owner, tripId, member.email, "editor");
    const ownerSocket = await connect(apiA, owner.cookie);
    const memberSocket = await connect(apiB, member.cookie);
    try {
      await join(ownerSocket, tripId);
      await join(memberSocket, tripId);

      const roleChanged = waitForEvent(memberSocket, "trip:invalidate");
      const notificationChanged = waitForEvent(
        memberSocket,
        "notifications:invalidate",
      );
      const downgrade = await browserPatch(
        apiA,
        `/api/trips/${tripId}/members/${member.id}`,
        owner.cookie,
      ).send({ role: "viewer" });
      expect(downgrade.status).toBe(200);
      await expect(roleChanged).resolves.toMatchObject({
        resources: ["members", "trip"],
      });
      await expect(notificationChanged).resolves.toEqual({});
      const forbidden = await browserPatch(
        apiB,
        `/api/trips/${tripId}`,
        member.cookie,
      ).send({ name: "Forbidden" });
      expect(forbidden.status).toBe(403);

      const revoked = waitForEvent(memberSocket, "trip:access-revoked");
      const revocationNotification = waitForEvent(
        memberSocket,
        "notifications:invalidate",
      );
      const removal = await browserDelete(
        apiA,
        `/api/trips/${tripId}/members/${member.id}`,
        owner.cookie,
      );
      expect(removal.status).toBe(204);
      await expect(revoked).resolves.toEqual({ tripId });
      await expect(revocationNotification).resolves.toEqual({});
      await expect(join(memberSocket, tripId)).resolves.toMatchObject({
        error: { code: "TRIP_ACCESS_DENIED" },
        ok: false,
      });

      const secondTripId = await createTrip(apiA, owner, "Delete me");
      await addMember(apiA, owner, secondTripId, member.email, "viewer");
      await join(ownerSocket, secondTripId);
      await join(memberSocket, secondTripId);
      const deleted = waitForEvent(memberSocket, "trip:deleted");
      const deletionNotification = waitForEvent(
        memberSocket,
        "notifications:invalidate",
      );
      const deletion = await browserDelete(
        apiA,
        `/api/trips/${secondTripId}`,
        owner.cookie,
      );
      expect(deletion.status).toBe(204);
      await expect(deleted).resolves.toEqual({ tripId: secondTripId });
      await expect(deletionNotification).resolves.toEqual({});

      const disconnected = waitForDisconnect(memberSocket);
      const logout = await browserPost(apiA, "/api/auth/logout", member.cookie);
      expect(logout.status).toBe(204);
      await expect(disconnected).resolves.toBe("io server disconnect");
      await expectRejectedConnection(apiB, member.cookie, WEB_ORIGIN);
    } finally {
      ownerSocket.disconnect();
      memberSocket.disconnect();
    }
  });

  it("throttles rapid authorized join attempts without disconnecting the socket", async () => {
    const owner = await register(apiA, "owner@example.com", "Owner");
    const tripId = await createTrip(apiA, owner, "Rate limited");
    const ownerSocket = await connect(apiA, owner.cookie);
    try {
      for (let attempt = 0; attempt < 20; attempt += 1) {
        await expect(join(ownerSocket, tripId)).resolves.toEqual({
          accessRole: "owner",
          ok: true,
        });
      }

      await expect(join(ownerSocket, tripId)).resolves.toMatchObject({
        error: { code: "RATE_LIMITED" },
        ok: false,
      });
      expect(ownerSocket.connected).toBe(true);
    } finally {
      ownerSocket.disconnect();
    }
  });

  it("disconnects a client that exceeds the Socket.IO payload limit", async () => {
    const owner = await register(apiA, "owner@example.com", "Owner");
    const ownerSocket = await connect(apiA, owner.cookie);
    try {
      const disconnected = waitForDisconnect(ownerSocket);
      ownerSocket.emit(
        "trip:join",
        { tripId: "x".repeat(70 * 1024) },
        () => undefined,
      );

      await expect(disconnected).resolves.toMatch(/transport close|server/iu);
    } finally {
      ownerSocket.disconnect();
    }
  });

  it("keeps REST successful during a Redis pause and resumes broadcasts", async () => {
    const owner = await register(apiA, "owner@example.com", "Owner");
    const editor = await register(apiA, "editor@example.com", "Editor");
    const tripId = await createTrip(apiA, owner, "Resilient");
    await addMember(apiA, owner, tripId, editor.email, "editor");
    const editorSocket = await connect(apiB, editor.cookie);
    try {
      await join(editorSocket, tripId);

      const pause = await redis.exec([
        "redis-cli",
        "CLIENT",
        "PAUSE",
        "2000",
        "ALL",
      ]);
      expect(pause.exitCode).toBe(0);
      const mutation = await browserPatch(
        apiA,
        `/api/trips/${tripId}/members/${editor.id}`,
        owner.cookie,
      ).send({ role: "viewer" });
      expect(mutation.status).toBe(200);
      const durable = await pool.query<{ total: number }>(
        "SELECT count(*)::int AS total FROM user_notifications WHERE user_id = $1 AND type = 'trip_role_changed'",
        [editor.id],
      );
      expect(durable.rows[0]?.total).toBe(1);
      await waitForRedis(redisUrl);
      await new Promise((resolveWait) => setTimeout(resolveWait, 250));

      const invalidation = waitForEvent(editorSocket, "trip:invalidate", 15_000);
      const notification = waitForEvent(
        editorSocket,
        "notifications:invalidate",
        15_000,
      );
      const recovered = await browserPatch(
        apiA,
        `/api/trips/${tripId}/members/${editor.id}`,
        owner.cookie,
      ).send({ role: "editor" });
      expect(recovered.status).toBe(200);
      await expect(invalidation).resolves.toEqual({
        resources: ["members", "trip"],
        tripId,
      });
      await expect(notification).resolves.toEqual({});
    } finally {
      editorSocket.disconnect();
    }
  });

  async function createApplication(module: typeof import("../src/app.module")["AppModule"]) {
    const testingModule = await Test.createTestingModule({ imports: [module] }).compile();
    const app = testingModule.createNestApplication();
    configureApplication(app);
    app.useWebSocketAdapter(
      new TripForgeIoAdapter(app, app.get(ConfigService)),
    );
    await app.listen(0, "127.0.0.1");
    return app;
  }
});

async function register(
  app: INestApplication,
  email: string,
  displayName: string,
): Promise<Identity> {
  const response = await browserPost(app, "/api/auth/register").send({
    displayName,
    email,
    password: PASSWORD,
  });
  expect(response.status).toBe(201);
  return {
    cookie: sessionCookie(response),
    email,
    id: response.body.user.id as string,
  };
}

async function createTrip(
  app: INestApplication,
  owner: Identity,
  name: string,
): Promise<string> {
  const response = await browserPost(app, "/api/trips", owner.cookie).send({ name });
  expect(response.status).toBe(201);
  return response.body.id as string;
}

async function addMember(
  app: INestApplication,
  owner: Identity,
  tripId: string,
  email: string,
  role: "editor" | "viewer",
): Promise<void> {
  const response = await browserPost(
    app,
    `/api/trips/${tripId}/members`,
    owner.cookie,
  ).send({ email, role });
  expect(response.status).toBe(201);
}

function browserPost(app: INestApplication, path: string, cookie?: string) {
  const pending = request(app.getHttpServer())
    .post(path)
    .set("Origin", WEB_ORIGIN)
    .set("X-TripForge-Request", "1");
  return cookie ? pending.set("Cookie", cookie) : pending;
}

function browserPatch(app: INestApplication, path: string, cookie: string) {
  return request(app.getHttpServer())
    .patch(path)
    .set("Cookie", cookie)
    .set("Origin", WEB_ORIGIN)
    .set("X-TripForge-Request", "1");
}

function browserDelete(app: INestApplication, path: string, cookie: string) {
  return request(app.getHttpServer())
    .delete(path)
    .set("Cookie", cookie)
    .set("Origin", WEB_ORIGIN)
    .set("X-TripForge-Request", "1");
}

function sessionCookie(response: Response): string {
  const header = response.headers["set-cookie"] as
    | string
    | string[]
    | undefined;
  const setCookie = Array.isArray(header) ? header[0] : header;
  const cookie = setCookie?.split(";", 1)[0];
  if (!cookie) throw new Error("Session cookie missing");
  return cookie;
}

async function connect(
  app: INestApplication,
  cookie: string,
): Promise<RealtimeClient> {
  const client: RealtimeClient = io(await app.getUrl(), {
    extraHeaders: { Cookie: cookie, Origin: WEB_ORIGIN },
    forceNew: true,
    path: "/socket.io",
    reconnection: false,
    transports: ["websocket"],
    transportOptions: {
      websocket: { extraHeaders: { Cookie: cookie, Origin: WEB_ORIGIN } },
    },
  });
  await new Promise<void>((resolveConnection, rejectConnection) => {
    const timeout = setTimeout(
      () => rejectConnection(new Error("Socket connection timed out")),
      5_000,
    );
    client.once("connect", () => {
      clearTimeout(timeout);
      resolveConnection();
    });
    client.once("connect_error", (error) => {
      clearTimeout(timeout);
      rejectConnection(error);
    });
  });
  return client;
}

async function expectRejectedConnection(
  app: INestApplication,
  cookie: string | undefined,
  origin: string,
): Promise<void> {
  const client = io(await app.getUrl(), {
    extraHeaders: { ...(cookie ? { Cookie: cookie } : {}), Origin: origin },
    forceNew: true,
    path: "/socket.io",
    reconnection: false,
    transports: ["websocket"],
    transportOptions: {
      websocket: {
        extraHeaders: { ...(cookie ? { Cookie: cookie } : {}), Origin: origin },
      },
    },
  });
  try {
    await new Promise<void>((resolveRejection, rejectRejection) => {
      const timeout = setTimeout(
        () => rejectRejection(new Error("Rejected connection timed out")),
        5_000,
      );
      client.once("connect", () => {
        clearTimeout(timeout);
        rejectRejection(new Error("Connection unexpectedly succeeded"));
      });
      client.once("connect_error", () => {
        clearTimeout(timeout);
        resolveRejection();
      });
    });
  } finally {
    client.disconnect();
  }
}

function join(client: RealtimeClient, tripId: string) {
  return new Promise<Parameters<ClientToServerEvents["trip:join"]>[1] extends (
    response: infer ResponseValue,
  ) => void
    ? ResponseValue
    : never>((resolveJoin) => {
    client.emit("trip:join", { tripId }, resolveJoin);
  });
}

function waitForEvent<Event extends keyof ServerToClientEvents>(
  client: RealtimeClient,
  event: Event,
  timeoutMs = 5_000,
): Promise<Parameters<ServerToClientEvents[Event]>[0]> {
  return new Promise((resolveEvent, rejectEvent) => {
    const timeout = setTimeout(() => {
      client.off(event, handler as never);
      rejectEvent(new Error(`Timed out waiting for ${event}`));
    }, timeoutMs);
    const handler = (payload: Parameters<ServerToClientEvents[Event]>[0]) => {
      clearTimeout(timeout);
      resolveEvent(payload);
    };
    client.once(event, handler as never);
  });
}

function waitForDisconnect(client: RealtimeClient): Promise<string> {
  return new Promise((resolveDisconnect, rejectDisconnect) => {
    const timeout = setTimeout(
      () => rejectDisconnect(new Error("Timed out waiting for disconnect")),
      5_000,
    );
    client.once("disconnect", (reason) => {
      clearTimeout(timeout);
      resolveDisconnect(reason);
    });
  });
}

async function waitForRedis(url: string): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const client = new Redis(url, {
      connectTimeout: 500,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null,
    });
    client.on("error", () => undefined);
    try {
      await client.ping();
      client.disconnect();
      return;
    } catch (error) {
      lastError = error;
      client.disconnect();
      await new Promise((resolveWait) => setTimeout(resolveWait, 100));
    }
  }
  throw new Error(
    `Redis did not recover: ${lastError instanceof Error ? lastError.message : "unknown error"}`,
  );
}
