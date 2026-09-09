import { resolve } from "node:path";

import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import { type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import request, { type Response } from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { AuthRepository } from "../src/auth/auth.repository";
import { hashSessionToken } from "../src/auth/session/session-token";
import { configureApplication } from "../src/common/configure-application";

const PASSWORD = "a sufficiently long password";
const WEB_ORIGIN = "http://127.0.0.1:3000";

function browserPost(app: INestApplication, path: string) {
  return request(app.getHttpServer())
    .post(path)
    .set("Origin", WEB_ORIGIN)
    .set("X-TripForge-Request", "1");
}

function getSessionCookie(response: Response): string {
  const setCookieHeader = response.headers["set-cookie"] as
    | string
    | string[]
    | undefined;
  const setCookie = Array.isArray(setCookieHeader)
    ? setCookieHeader[0]
    : setCookieHeader;

  if (!setCookie) {
    throw new Error("Response did not set a session cookie");
  }

  return setCookie.split(";", 1)[0] ?? "";
}

function rawTokenFromCookie(cookie: string): string {
  const separator = cookie.indexOf("=");

  if (separator === -1) {
    throw new Error("Session cookie has no value");
  }

  return cookie.slice(separator + 1);
}

describe("Authentication with PostgreSQL", () => {
  let app: INestApplication;
  let authRepository: AuthRepository;
  let container: StartedPostgreSqlContainer;
  let pool: Pool;

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:18.6-bookworm")
      .withDatabase("tripforge")
      .withUsername("tripforge")
      .withPassword("tripforge")
      .start();

    const databaseUrl = container.getConnectionUri();
    const migrationPool = new Pool({ connectionString: databaseUrl });

    await migrate(drizzle(migrationPool), {
      migrationsFolder: resolve(process.cwd(), "drizzle"),
    });
    await migrationPool.end();

    process.env.DATABASE_URL = databaseUrl;
    process.env.NODE_ENV = "test";
    process.env.WEB_ORIGIN = WEB_ORIGIN;

    const { AppModule } = await import("../src/app.module");
    const testingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    authRepository = testingModule.get(AuthRepository);
    app = testingModule.createNestApplication();
    configureApplication(app);
    await app.init();

    pool = new Pool({ connectionString: databaseUrl });
  });

  beforeEach(async () => {
    await pool.query(
      "TRUNCATE TABLE auth_sessions, password_credentials, trips, users CASCADE",
    );
  });

  afterAll(async () => {
    await app?.close();
    await pool?.end();
    await container?.stop();
  });

  it("registers atomically and stores only protected credentials and tokens", async () => {
    const response = await browserPost(app, "/api/auth/register").send({
      displayName: "Arthur",
      email: "user@example.com",
      password: PASSWORD,
    });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      user: {
        displayName: "Arthur",
        email: "user@example.com",
        id: expect.any(String),
      },
    });
    expect(JSON.stringify(response.body)).not.toMatch(
      /password|tokenHash|token_hash|session/i,
    );

    const cookie = getSessionCookie(response);
    expect(response.headers["set-cookie"]?.[0]).toContain("HttpOnly");
    expect(response.headers["set-cookie"]?.[0]).toContain("SameSite=Lax");
    expect(response.headers["set-cookie"]?.[0]).toContain("Path=/");
    expect(cookie).toMatch(/^tripforge_session=/);

    const persisted = await pool.query<{
      email: string;
      password_hash: string;
      token_hash: string;
    }>(
      `SELECT u.email, pc.password_hash, s.token_hash
       FROM users u
       JOIN password_credentials pc ON pc.user_id = u.id
       JOIN auth_sessions s ON s.user_id = u.id`,
    );
    const row = persisted.rows[0];

    expect(row).toBeDefined();
    expect(row?.email).toBe("user@example.com");
    expect(row?.password_hash).not.toBe(PASSWORD);
    expect(row?.password_hash).toMatch(/^\$argon2id\$/);

    const rawToken = rawTokenFromCookie(cookie);
    expect(row?.token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(row?.token_hash).not.toBe(rawToken);

    expect(row?.token_hash).toBe(hashSessionToken(rawToken));
  });

  it("normalizes email and rejects an equivalent registration", async () => {
    const firstResponse = await browserPost(app, "/api/auth/register").send({
      email: "  User@Example.COM  ",
      password: PASSWORD,
    });
    const duplicateResponse = await browserPost(app, "/api/auth/register").send({
      email: "user@example.com",
      password: PASSWORD,
    });

    expect(firstResponse.status).toBe(201);
    expect(firstResponse.body.user.email).toBe("user@example.com");
    expect(duplicateResponse.status).toBe(409);
    expect(duplicateResponse.body).toMatchObject({
      code: "ACCOUNT_ALREADY_EXISTS",
      message: "An account with this email already exists",
      statusCode: 409,
    });
  });

  it("rolls the user and credential back when session creation fails", async () => {
    await expect(
      authRepository.createUserWithCredentialAndSession({
        email: "rollback@example.com",
        expiresAt: new Date(Date.now() + 60_000),
        passwordHash: "not-plaintext-but-invalid-argon-is-enough-for-this-test",
        tokenHash: "invalid-token-hash",
      }),
    ).rejects.toBeDefined();

    const usersResult = await pool.query(
      "SELECT id FROM users WHERE email = $1",
      ["rollback@example.com"],
    );
    const credentialsResult = await pool.query(
      "SELECT user_id FROM password_credentials",
    );

    expect(usersResult.rowCount).toBe(0);
    expect(credentialsResult.rowCount).toBe(0);
  });

  it("logs in with correct credentials and creates a new session", async () => {
    const registration = await browserPost(app, "/api/auth/register").send({
      email: "user@example.com",
      password: PASSWORD,
    });
    const login = await browserPost(app, "/api/auth/login").send({
      email: " USER@example.com ",
      password: PASSWORD,
    });

    expect(login.status).toBe(200);
    expect(login.body.user).toEqual(registration.body.user);
    expect(getSessionCookie(login)).not.toBe(getSessionCookie(registration));

    const sessions = await pool.query("SELECT id FROM auth_sessions");
    expect(sessions.rowCount).toBe(2);
  });

  it("uses the same public failure for wrong and unknown credentials", async () => {
    await browserPost(app, "/api/auth/register").send({
      email: "user@example.com",
      password: PASSWORD,
    });

    const wrongPassword = await browserPost(app, "/api/auth/login").send({
      email: "user@example.com",
      password: "incorrect",
    });
    const unknownEmail = await browserPost(app, "/api/auth/login").send({
      email: "unknown@example.com",
      password: "incorrect",
    });

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body).toMatchObject({
      code: "INVALID_CREDENTIALS",
      message: "Invalid email or password",
      statusCode: 401,
    });
    expect(unknownEmail.body).toMatchObject({
      code: wrongPassword.body.code,
      message: wrongPassword.body.message,
      statusCode: wrongPassword.body.statusCode,
    });
  });

  it("resolves the current user and revokes the session on logout", async () => {
    const registration = await browserPost(app, "/api/auth/register").send({
      email: "user@example.com",
      password: PASSWORD,
    });
    const cookie = getSessionCookie(registration);

    const unauthenticated = await request(app.getHttpServer()).get(
      "/api/auth/me",
    );
    const authenticated = await request(app.getHttpServer())
      .get("/api/auth/me")
      .set("Cookie", cookie);
    const logout = await browserPost(app, "/api/auth/logout").set(
      "Cookie",
      cookie,
    );
    const afterLogout = await request(app.getHttpServer())
      .get("/api/auth/me")
      .set("Cookie", cookie);

    expect(unauthenticated.status).toBe(401);
    expect(unauthenticated.body.code).toBe("UNAUTHENTICATED");
    expect(authenticated.status).toBe(200);
    expect(authenticated.body).toEqual({ user: registration.body.user });
    expect(logout.status).toBe(204);
    expect(logout.text).toBe("");
    expect(afterLogout.status).toBe(401);
    expect(afterLogout.body.code).toBe("UNAUTHENTICATED");

    const sessions = await pool.query("SELECT id FROM auth_sessions");
    expect(sessions.rowCount).toBe(0);
  });

  it("rejects and opportunistically deletes an expired session", async () => {
    const registration = await browserPost(app, "/api/auth/register").send({
      email: "user@example.com",
      password: PASSWORD,
    });
    const cookie = getSessionCookie(registration);

    await pool.query(
      `UPDATE auth_sessions
       SET created_at = now() - interval '2 days',
           expires_at = now() - interval '1 day'`,
    );

    const response = await request(app.getHttpServer())
      .get("/api/auth/me")
      .set("Cookie", cookie);

    expect(response.status).toBe(401);
    expect(response.body.code).toBe("UNAUTHENTICATED");

    const sessions = await pool.query("SELECT id FROM auth_sessions");
    expect(sessions.rowCount).toBe(0);
  });

  it("keeps logout idempotent when no session exists", async () => {
    const response = await browserPost(app, "/api/auth/logout");

    expect(response.status).toBe(204);
  });
});
