import { resolve } from "node:path";

import { type INestApplication } from "@nestjs/common";
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
import request, { type Response } from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { configureApplication } from "../src/common/configure-application";
import { RedisThrottlerStorage } from "../src/security/redis-throttler.storage";

const PASSWORD = "a sufficiently long password";
const WEB_ORIGIN = "http://127.0.0.1:3000";

describe("distributed security controls", () => {
  let apiA: INestApplication;
  let apiB: INestApplication;
  let pool: Pool;
  let postgres: StartedPostgreSqlContainer;
  let redis: StartedRedisContainer;
  let redisUrl: string;
  let redisStopped = false;
  const previousRateLimitSetting = process.env.SECURITY_RATE_LIMITING_ENABLED;

  beforeAll(async () => {
    [postgres, redis] = await Promise.all([
      new PostgreSqlContainer("postgres:18.6-bookworm")
        .withDatabase("tripforge")
        .withUsername("tripforge")
        .withPassword("tripforge")
        .start(),
      new RedisContainer("redis:8.10.1-alpine").start(),
    ]);
    const databaseUrl = postgres.getConnectionUri();
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
    if (!redisStopped) {
      const client = new Redis(redisUrl);
      await client.flushdb();
      await client.quit();
    }
  });

  afterAll(async () => {
    await Promise.all([apiA?.close(), apiB?.close()]);
    await pool?.end();
    await postgres?.stop();
    if (!redisStopped) await redis?.stop();
    if (previousRateLimitSetting === undefined) {
      delete process.env.SECURITY_RATE_LIMITING_ENABLED;
    } else {
      process.env.SECURITY_RATE_LIMITING_ENABLED = previousRateLimitSetting;
    }
  });

  it("shares account throttles across two API instances", async () => {
    await register(apiA, "user@example.com");

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const app = attempt % 2 === 0 ? apiA : apiB;
      const response = await browserPost(app, "/api/auth/login").send({
        email: " USER@example.com ",
        password: "wrong-password",
      });
      expect(response.status).toBe(401);
    }

    const blocked = await browserPost(apiB, "/api/auth/login").send({
      email: "user@example.com",
      password: "wrong-password",
    });
    const validWhileBlocked = await browserPost(apiA, "/api/auth/login").send({
      email: "user@example.com",
      password: PASSWORD,
    });

    expect(blocked.status).toBe(429);
    expect(blocked.body).toMatchObject({
      code: "TOO_MANY_REQUESTS",
      message: "Too many requests. Please try again later.",
    });
    expect(JSON.stringify(blocked.body)).not.toMatch(/email|bucket|remaining/iu);
    expect(validWhileBlocked.status).toBe(429);
  });

  it("limits password spraying by IP independently of account names", async () => {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const app = attempt % 2 === 0 ? apiA : apiB;
      const response = await browserPost(app, "/api/auth/login").send({
        email: `unknown-${attempt}@example.com`,
        password: "wrong-password",
      });
      expect(response.status).toBe(401);
    }

    const blocked = await browserPost(apiB, "/api/auth/login").send({
      email: "another-account@example.com",
      password: "wrong-password",
    });
    expect(blocked.status).toBe(429);
  });

  it("increments atomically across clients and expires the window", async () => {
    const storageA = apiA.get(RedisThrottlerStorage);
    const storageB = apiB.get(RedisThrottlerStorage);
    const results = await Promise.all(
      Array.from({ length: 40 }, (_, index) =>
        (index % 2 === 0 ? storageA : storageB).increment(
          "atomic-test",
          80,
          100,
          80,
          "atomic-test",
        ),
      ),
    );

    expect(results.map(({ totalHits }) => totalHits).sort((a, b) => a - b)).toEqual(
      Array.from({ length: 40 }, (_, index) => index + 1),
    );
    await new Promise((resolve) => setTimeout(resolve, 120));
    await expect(
      storageA.increment("atomic-test", 80, 100, 80, "atomic-test"),
    ).resolves.toMatchObject({ isBlocked: false, totalHits: 1 });
  });

  it("starts a fresh window after a shorter block expires", async () => {
    const storageA = apiA.get(RedisThrottlerStorage);
    const storageB = apiB.get(RedisThrottlerStorage);

    await storageA.increment("block-reset-test", 1_000, 1, 80, "block-reset-test");
    await expect(
      storageB.increment("block-reset-test", 1_000, 1, 80, "block-reset-test"),
    ).resolves.toMatchObject({ isBlocked: true, totalHits: 2 });

    await new Promise((resolve) => setTimeout(resolve, 120));
    await expect(
      storageA.increment("block-reset-test", 1_000, 1, 80, "block-reset-test"),
    ).resolves.toMatchObject({ isBlocked: false, totalHits: 1 });
  });

  it("rejects cross-origin mutation with a valid session and preserves it", async () => {
    const registration = await register(apiA, "csrf@example.com");
    const cookie = getSessionCookie(registration);
    const rejected = await request(apiA.getHttpServer())
      .post("/api/auth/logout")
      .set("Cookie", cookie)
      .set("Origin", "https://evil.example")
      .set("Sec-Fetch-Site", "cross-site")
      .set("X-TripForge-Request", "1");
    const current = await request(apiA.getHttpServer())
      .get("/api/auth/me")
      .set("Cookie", cookie);

    expect(rejected.status).toBe(403);
    expect(current.status).toBe(200);
  });

  it("enforces body limits, private caching, and defensive headers", async () => {
    const oversized = await browserPost(apiA, "/api/auth/register").send({
      displayName: "x".repeat(300 * 1024),
      email: "large@example.com",
      password: PASSWORD,
    });
    const me = await request(apiA.getHttpServer()).get("/api/auth/me");

    expect(oversized.status).toBe(413);
    expect(oversized.body.code).toBe("PAYLOAD_TOO_LARGE");
    expect(me.headers["cache-control"]).toBe("private, no-store");
    expect(me.headers["x-content-type-options"]).toBe("nosniff");
    expect(me.headers["x-frame-options"]).toBe("SAMEORIGIN");
    expect(me.headers["x-powered-by"]).toBeUndefined();
  });

  it("fails auth closed when Redis is unavailable but keeps unrelated reads", async () => {
    const registration = await register(apiA, "available@example.com");
    const cookie = getSessionCookie(registration);
    await redis.stop();
    redisStopped = true;

    const login = await browserPost(apiA, "/api/auth/login").send({
      email: "available@example.com",
      password: PASSWORD,
    });
    const current = await request(apiA.getHttpServer())
      .get("/api/auth/me")
      .set("Cookie", cookie);

    expect(login.status).toBe(503);
    expect(login.body).toMatchObject({
      code: "RATE_LIMIT_UNAVAILABLE",
      message: "Service temporarily unavailable",
    });
    expect(current.status).toBe(200);
  });
});

async function createApplication(module: unknown): Promise<INestApplication> {
  const testingModule = await Test.createTestingModule({
    imports: [module as never],
  }).compile();
  const app = testingModule.createNestApplication();
  configureApplication(app);
  // Keep both nodes bound for the suite; do not let Supertest reopen/close them
  // on every alternating request while Socket.IO is attached to the same server.
  await app.listen(0, "127.0.0.1");
  return app;
}

function browserPost(app: INestApplication, path: string) {
  return request(app.getHttpServer())
    .post(path)
    .set("Origin", WEB_ORIGIN)
    .set("Sec-Fetch-Site", "same-origin")
    .set("X-TripForge-Request", "1");
}

function register(app: INestApplication, email: string): Promise<Response> {
  return browserPost(app, "/api/auth/register").send({
    email,
    password: PASSWORD,
  });
}

function getSessionCookie(response: Response): string {
  const rawHeader = response.headers["set-cookie"] as
    | string
    | string[]
    | undefined;
  const header = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
  const value = header?.split(";", 1)[0];
  if (!value) throw new Error("Session cookie was not set");
  return value;
}
