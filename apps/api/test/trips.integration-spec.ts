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

import { configureApplication } from "../src/common/configure-application";

const PASSWORD = "a sufficiently long password";
const WEB_ORIGIN = "http://127.0.0.1:3000";
const UNKNOWN_TRIP_ID = "00000000-0000-4000-8000-000000000001";
const UNKNOWN_USER_ID = "00000000-0000-4000-8000-000000000002";

type TestIdentity = {
  cookie: string;
  id: string;
};

function browserPost(app: INestApplication, path: string) {
  return request(app.getHttpServer())
    .post(path)
    .set("Origin", WEB_ORIGIN)
    .set("X-TripForge-Request", "1");
}

function browserPatch(app: INestApplication, path: string) {
  return request(app.getHttpServer())
    .patch(path)
    .set("Origin", WEB_ORIGIN)
    .set("X-TripForge-Request", "1");
}

function browserDelete(app: INestApplication, path: string) {
  return request(app.getHttpServer())
    .delete(path)
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

describe("Trips CRUD with PostgreSQL", () => {
  let app: INestApplication;
  let container: StartedPostgreSqlContainer;
  let pool: Pool;
  let userA: TestIdentity;
  let userB: TestIdentity;
  let userC: TestIdentity;
  let userD: TestIdentity;

  async function register(email: string): Promise<TestIdentity> {
    const response = await browserPost(app, "/api/auth/register").send({
      email,
      password: PASSWORD,
    });

    expect(response.status).toBe(201);

    return {
      cookie: getSessionCookie(response),
      id: response.body.user.id as string,
    };
  }

  async function createTrip(
    identity: TestIdentity,
    input: {
      name: string;
      startsOn?: string | null;
      endsOn?: string | null;
    },
  ): Promise<Response> {
    return browserPost(app, "/api/trips")
      .set("Cookie", identity.cookie)
      .send(input);
  }

  async function addMember(
    owner: TestIdentity,
    tripId: string,
    email: string,
    role: "editor" | "viewer",
  ): Promise<Response> {
    return browserPost(app, `/api/trips/${tripId}/members`)
      .set("Cookie", owner.cookie)
      .send({ email, role });
  }

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

    app = testingModule.createNestApplication();
    configureApplication(app);
    await app.init();

    pool = new Pool({ connectionString: databaseUrl });
  });

  beforeEach(async () => {
    await pool.query(
      "TRUNCATE TABLE auth_sessions, password_credentials, trip_members, trips, users CASCADE",
    );
    userA = await register("user-a@example.com");
    userB = await register("user-b@example.com");
    userC = await register("user-c@example.com");
    userD = await register("user-d@example.com");
  });

  afterAll(async () => {
    await app?.close();
    await pool?.end();
    await container?.stop();
  });

  it("creates an owner-scoped trip and rejects forged or invalid input", async () => {
    const created = await createTrip(userA, {
      endsOn: "2027-04-28",
      name: "   Japan 2027   ",
      startsOn: "2027-04-12",
    });

    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      endsOn: "2027-04-28",
      id: expect.any(String),
      name: "Japan 2027",
      startsOn: "2027-04-12",
    });
    expect(created.body).not.toHaveProperty("ownerId");

    const persisted = await pool.query<{
      name: string;
      owner_id: string;
    }>("SELECT name, owner_id FROM trips WHERE id = $1", [created.body.id]);

    expect(persisted.rows[0]).toEqual({
      name: "Japan 2027",
      owner_id: userA.id,
    });

    const forgedOwner = await browserPost(app, "/api/trips")
      .set("Cookie", userA.cookie)
      .send({ name: "Forged", ownerId: userB.id });
    const invalidRange = await createTrip(userA, {
      endsOn: "2027-04-11",
      name: "Invalid range",
      startsOn: "2027-04-12",
    });
    const blankName = await createTrip(userA, { name: "   " });
    const malformedDate = await createTrip(userA, {
      name: "Impossible date",
      startsOn: "2027-02-30",
    });

    expect(forgedOwner.status).toBe(400);
    expect(forgedOwner.body.code).toBe("VALIDATION_ERROR");
    expect(invalidRange.status).toBe(400);
    expect(invalidRange.body.code).toBe("INVALID_TRIP_DATE_RANGE");
    expect(blankName.status).toBe(400);
    expect(malformedDate.status).toBe(400);

    const total = await pool.query<{ total: number }>(
      "SELECT count(*)::int AS total FROM trips",
    );
    expect(total.rows[0]?.total).toBe(1);
  });

  it("lists only owned trips with deterministic two-page metadata", async () => {
    const createdA = await Promise.all([
      createTrip(userA, { name: "Japan" }),
      createTrip(userA, { name: "Norway" }),
      createTrip(userA, { name: "Peru" }),
    ]);
    await createTrip(userB, { name: "Italy" });

    const ids = createdA.map((response) => response.body.id as string);
    await pool.query(
      "UPDATE trips SET created_at = $1 WHERE owner_id = $2",
      ["2026-09-12T10:00:00.000Z", userA.id],
    );
    const expectedOrder = [...ids].sort((left, right) =>
      left < right ? 1 : left > right ? -1 : 0,
    );

    const firstPage = await request(app.getHttpServer())
      .get("/api/trips?page=1&pageSize=2")
      .set("Cookie", userA.cookie);
    const secondPage = await request(app.getHttpServer())
      .get("/api/trips?page=2&pageSize=2")
      .set("Cookie", userA.cookie);
    const invalidPage = await request(app.getHttpServer())
      .get("/api/trips?page=0&pageSize=101")
      .set("Cookie", userA.cookie);
    const defaultPage = await request(app.getHttpServer())
      .get("/api/trips")
      .set("Cookie", userB.cookie);
    const unauthenticated = await request(app.getHttpServer()).get(
      "/api/trips",
    );

    expect(firstPage.status).toBe(200);
    expect(firstPage.body).toMatchObject({
      page: 1,
      pageSize: 2,
      total: 3,
      totalPages: 2,
    });
    expect(secondPage.body).toMatchObject({
      page: 2,
      pageSize: 2,
      total: 3,
      totalPages: 2,
    });
    expect([
      ...firstPage.body.items.map(({ id }: { id: string }) => id),
      ...secondPage.body.items.map(({ id }: { id: string }) => id),
    ]).toEqual(expectedOrder);
    expect(
      [...firstPage.body.items, ...secondPage.body.items].map(
        ({ name }: { name: string }) => name,
      ),
    ).not.toContain("Italy");
    expect(invalidPage.status).toBe(400);
    expect(defaultPage.body).toMatchObject({
      page: 1,
      pageSize: 20,
      total: 1,
      totalPages: 1,
    });
    expect(unauthenticated.status).toBe(401);
  });

  it("hides foreign and nonexistent resources behind the same 404", async () => {
    const owned = await createTrip(userA, { name: "Japan" });
    const foreign = await createTrip(userB, { name: "Italy" });

    const ownResponse = await request(app.getHttpServer())
      .get(`/api/trips/${owned.body.id}`)
      .set("Cookie", userA.cookie);
    const foreignResponse = await request(app.getHttpServer())
      .get(`/api/trips/${foreign.body.id}`)
      .set("Cookie", userA.cookie);
    const unknownResponse = await request(app.getHttpServer())
      .get(`/api/trips/${UNKNOWN_TRIP_ID}`)
      .set("Cookie", userA.cookie);
    const malformedResponse = await request(app.getHttpServer())
      .get("/api/trips/not-a-uuid")
      .set("Cookie", userA.cookie);
    const unauthenticated = await request(app.getHttpServer()).get(
      `/api/trips/${owned.body.id}`,
    );

    expect(ownResponse.status).toBe(200);
    expect(foreignResponse.status).toBe(404);
    expect(unknownResponse.status).toBe(404);
    expect(foreignResponse.body).toMatchObject({
      code: "TRIP_NOT_FOUND",
      message: "Trip not found",
    });
    expect(unknownResponse.body).toMatchObject({
      code: "TRIP_NOT_FOUND",
      message: "Trip not found",
    });
    expect(malformedResponse.status).toBe(400);
    expect(unauthenticated.status).toBe(401);
    expect(unauthenticated.body.code).toBe("UNAUTHENTICATED");
  });

  it("updates owned state, clears dates, and protects foreign rows", async () => {
    const owned = await createTrip(userA, {
      endsOn: "2027-04-20",
      name: "Japan",
      startsOn: "2027-04-10",
    });
    const foreign = await createTrip(userB, {
      endsOn: "2027-06-20",
      name: "Italy",
      startsOn: "2027-06-10",
    });
    await pool.query("UPDATE trips SET updated_at = $1 WHERE id = $2", [
      "2020-01-01T00:00:00.000Z",
      owned.body.id,
    ]);

    const updated = await browserPatch(app, `/api/trips/${owned.body.id}`)
      .set("Cookie", userA.cookie)
      .send({ name: "  Japan updated  ", startsOn: null });

    expect(updated.status).toBe(200);
    expect(updated.body).toMatchObject({
      endsOn: "2027-04-20",
      name: "Japan updated",
      startsOn: null,
    });
    expect(new Date(updated.body.updatedAt).getTime()).toBeGreaterThan(
      new Date("2020-01-01T00:00:00.000Z").getTime(),
    );

    const invalidResult = await browserPatch(app, `/api/trips/${owned.body.id}`)
      .set("Cookie", userA.cookie)
      .send({ startsOn: "2027-04-25" });
    const foreignUpdate = await browserPatch(app, `/api/trips/${foreign.body.id}`)
      .set("Cookie", userA.cookie)
      .send({ name: "Stolen" });
    const emptyUpdate = await browserPatch(app, `/api/trips/${owned.body.id}`)
      .set("Cookie", userA.cookie)
      .send({});
    const nullName = await browserPatch(app, `/api/trips/${owned.body.id}`)
      .set("Cookie", userA.cookie)
      .send({ name: null });

    expect(invalidResult.status).toBe(400);
    expect(invalidResult.body.code).toBe("INVALID_TRIP_DATE_RANGE");
    expect(foreignUpdate.status).toBe(404);
    expect(foreignUpdate.body.code).toBe("TRIP_NOT_FOUND");
    expect(emptyUpdate.status).toBe(400);
    expect(emptyUpdate.body.code).toBe("EMPTY_TRIP_UPDATE");
    expect(nullName.status).toBe(400);
    expect(nullName.body.code).toBe("VALIDATION_ERROR");

    const rows = await pool.query<{
      id: string;
      name: string;
      starts_on: string | null;
    }>("SELECT id, name, starts_on FROM trips ORDER BY id");
    const ownedRow = rows.rows.find(({ id }) => id === owned.body.id);
    const foreignRow = rows.rows.find(({ id }) => id === foreign.body.id);

    expect(ownedRow).toMatchObject({ name: "Japan updated", starts_on: null });
    expect(foreignRow?.name).toBe("Italy");
  });

  it("hard-deletes only owned resources and rejects unknown targets", async () => {
    const owned = await createTrip(userA, { name: "Japan" });
    const foreign = await createTrip(userB, { name: "Italy" });

    const deleted = await browserDelete(app, `/api/trips/${owned.body.id}`).set(
      "Cookie",
      userA.cookie,
    );
    const foreignDelete = await browserDelete(
      app,
      `/api/trips/${foreign.body.id}`,
    ).set("Cookie", userA.cookie);
    const unknownDelete = await browserDelete(
      app,
      `/api/trips/${UNKNOWN_TRIP_ID}`,
    ).set("Cookie", userA.cookie);
    const unauthenticated = await browserDelete(
      app,
      `/api/trips/${foreign.body.id}`,
    );

    expect(deleted.status).toBe(204);
    expect(deleted.text).toBe("");
    expect(foreignDelete.status).toBe(404);
    expect(unknownDelete.status).toBe(404);
    expect(unauthenticated.status).toBe(401);

    const remaining = await pool.query<{ id: string }>(
      "SELECT id FROM trips ORDER BY id",
    );
    expect(remaining.rows).toEqual([{ id: foreign.body.id }]);
  });

  it("applies the shared browser mutation policy to Trip writes", async () => {
    const missingHeader = await request(app.getHttpServer())
      .post("/api/trips")
      .set("Cookie", userA.cookie)
      .set("Origin", WEB_ORIGIN)
      .send({ name: "Missing marker" });
    const wrongOrigin = await request(app.getHttpServer())
      .post("/api/trips")
      .set("Cookie", userA.cookie)
      .set("Origin", "https://evil.example")
      .set("X-TripForge-Request", "1")
      .send({ name: "Wrong origin" });
    const trusted = await createTrip(userA, { name: "Trusted" });

    expect(missingHeader.status).toBe(403);
    expect(missingHeader.body.code).toBe("CSRF_PROTECTION_FAILED");
    expect(wrongOrigin.status).toBe(403);
    expect(wrongOrigin.body.code).toBe("CSRF_PROTECTION_FAILED");
    expect(trusted.status).toBe(201);
  });

  it("adds existing users as members and rejects duplicate, owner, and unknown targets", async () => {
    const created = await createTrip(userA, { name: "Japan" });
    const tripId = created.body.id as string;
    const editor = await addMember(
      userA,
      tripId,
      "  USER-B@example.com ",
      "editor",
    );
    const viewer = await addMember(
      userA,
      tripId,
      "user-c@example.com",
      "viewer",
    );
    const duplicate = await addMember(
      userA,
      tripId,
      "user-b@example.com",
      "viewer",
    );
    const owner = await addMember(
      userA,
      tripId,
      "user-a@example.com",
      "viewer",
    );
    const unknown = await addMember(
      userA,
      tripId,
      "missing@example.com",
      "viewer",
    );

    expect(editor.status).toBe(201);
    expect(editor.body).toMatchObject({
      role: "editor",
      user: { email: "user-b@example.com", id: userB.id },
    });
    expect(viewer.status).toBe(201);
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.code).toBe("TRIP_MEMBER_ALREADY_EXISTS");
    expect(owner.status).toBe(409);
    expect(owner.body.code).toBe("TRIP_OWNER_CANNOT_BE_MEMBER");
    expect(unknown.status).toBe(404);
    expect(unknown.body.code).toBe("INVITEE_NOT_FOUND");

    const rows = await pool.query<{
      role: string;
      trip_id: string;
      user_id: string;
    }>(
      "SELECT trip_id, user_id, role FROM trip_members WHERE trip_id = $1 ORDER BY user_id",
      [tripId],
    );
    expect(rows.rows).toEqual(
      [
        { role: "editor", trip_id: tripId, user_id: userB.id },
        { role: "viewer", trip_id: tripId, user_id: userC.id },
      ].sort((left, right) => left.user_id.localeCompare(right.user_id)),
    );

    const participants = await request(app.getHttpServer())
      .get(`/api/trips/${tripId}/members`)
      .set("Cookie", userC.cookie);
    expect(participants.status).toBe(200);
    expect(participants.body[0]).toMatchObject({
      role: "owner",
      user: { id: userA.id },
    });
    expect(participants.body).toHaveLength(3);
  });

  it("lists and reads owned, editor, and viewer trips with effective roles", async () => {
    const owned = await createTrip(userA, { name: "Owned" });
    const edited = await createTrip(userB, { name: "Edited" });
    const viewed = await createTrip(userC, { name: "Viewed" });
    const unrelated = await createTrip(userD, { name: "Unrelated" });
    await addMember(userB, edited.body.id, "user-a@example.com", "editor");
    await addMember(userC, viewed.body.id, "user-a@example.com", "viewer");

    const list = await request(app.getHttpServer())
      .get("/api/trips?page=1&pageSize=10")
      .set("Cookie", userA.cookie);

    expect(list.status).toBe(200);
    expect(list.body).toMatchObject({ total: 3, totalPages: 1 });
    expect(
      Object.fromEntries(
        list.body.items.map(
          ({ name, accessRole }: { name: string; accessRole: string }) => [
            name,
            accessRole,
          ],
        ),
      ),
    ).toEqual({ Edited: "editor", Owned: "owner", Viewed: "viewer" });
    expect(list.body.items.map(({ id }: { id: string }) => id)).not.toContain(
      unrelated.body.id,
    );

    for (const [response, role] of [
      [owned, "owner"],
      [edited, "editor"],
      [viewed, "viewer"],
    ] as const) {
      const get = await request(app.getHttpServer())
        .get(`/api/trips/${response.body.id}`)
        .set("Cookie", userA.cookie);
      expect(get.status).toBe(200);
      expect(get.body.accessRole).toBe(role);
    }

    const hidden = await request(app.getHttpServer())
      .get(`/api/trips/${unrelated.body.id}`)
      .set("Cookie", userA.cookie);
    expect(hidden.status).toBe(404);
    expect(hidden.body.code).toBe("TRIP_NOT_FOUND");
  });

  it("enforces role-constrained updates and owner-constrained deletion", async () => {
    const created = await createTrip(userA, { name: "Shared" });
    const tripId = created.body.id as string;
    await addMember(userA, tripId, "user-b@example.com", "editor");
    await addMember(userA, tripId, "user-c@example.com", "viewer");

    const ownerUpdate = await browserPatch(app, `/api/trips/${tripId}`)
      .set("Cookie", userA.cookie)
      .send({ name: "Owner edit" });
    const editorUpdate = await browserPatch(app, `/api/trips/${tripId}`)
      .set("Cookie", userB.cookie)
      .send({ name: "Editor edit" });
    const viewerUpdate = await browserPatch(app, `/api/trips/${tripId}`)
      .set("Cookie", userC.cookie)
      .send({ name: "Viewer edit" });
    const unrelatedUpdate = await browserPatch(app, `/api/trips/${tripId}`)
      .set("Cookie", userD.cookie)
      .send({ name: "Unrelated edit" });

    expect(ownerUpdate.status).toBe(200);
    expect(ownerUpdate.body.accessRole).toBe("owner");
    expect(editorUpdate.status).toBe(200);
    expect(editorUpdate.body.accessRole).toBe("editor");
    expect(viewerUpdate.status).toBe(403);
    expect(viewerUpdate.body.code).toBe("INSUFFICIENT_TRIP_PERMISSION");
    expect(unrelatedUpdate.status).toBe(404);

    const persisted = await pool.query<{ name: string }>(
      "SELECT name FROM trips WHERE id = $1",
      [tripId],
    );
    expect(persisted.rows[0]?.name).toBe("Editor edit");

    for (const identity of [userB, userC]) {
      const denied = await browserDelete(app, `/api/trips/${tripId}`).set(
        "Cookie",
        identity.cookie,
      );
      expect(denied.status).toBe(403);
      expect(denied.body.code).toBe("INSUFFICIENT_TRIP_PERMISSION");
    }
    const hidden = await browserDelete(app, `/api/trips/${tripId}`).set(
      "Cookie",
      userD.cookie,
    );
    expect(hidden.status).toBe(404);
    expect(
      (await pool.query("SELECT 1 FROM trips WHERE id = $1", [tripId])).rowCount,
    ).toBe(1);

    const deleted = await browserDelete(app, `/api/trips/${tripId}`).set(
      "Cookie",
      userA.cookie,
    );
    expect(deleted.status).toBe(204);
    expect(
      (await pool.query("SELECT 1 FROM trip_members WHERE trip_id = $1", [tripId]))
        .rowCount,
    ).toBe(0);
  });

  it("applies role downgrade and revocation to existing sessions immediately", async () => {
    const created = await createTrip(userA, { name: "Shared" });
    const tripId = created.body.id as string;
    await addMember(userA, tripId, "user-b@example.com", "editor");
    await addMember(userA, tripId, "user-c@example.com", "viewer");

    const editorBefore = await browserPatch(app, `/api/trips/${tripId}`)
      .set("Cookie", userB.cookie)
      .send({ name: "Editor was here" });
    expect(editorBefore.status).toBe(200);

    const downgraded = await browserPatch(
      app,
      `/api/trips/${tripId}/members/${userB.id}`,
    )
      .set("Cookie", userA.cookie)
      .send({ role: "viewer" });
    expect(downgraded.status).toBe(200);
    expect(downgraded.body.role).toBe("viewer");

    const editorAfter = await browserPatch(app, `/api/trips/${tripId}`)
      .set("Cookie", userB.cookie)
      .send({ name: "Should fail" });
    expect(editorAfter.status).toBe(403);

    const viewerBefore = await request(app.getHttpServer())
      .get(`/api/trips/${tripId}`)
      .set("Cookie", userC.cookie);
    expect(viewerBefore.status).toBe(200);

    const removed = await browserDelete(
      app,
      `/api/trips/${tripId}/members/${userC.id}`,
    ).set("Cookie", userA.cookie);
    expect(removed.status).toBe(204);

    const viewerAfter = await request(app.getHttpServer())
      .get(`/api/trips/${tripId}`)
      .set("Cookie", userC.cookie);
    const viewerSession = await request(app.getHttpServer())
      .get("/api/auth/me")
      .set("Cookie", userC.cookie);
    expect(viewerAfter.status).toBe(404);
    expect(viewerSession.status).toBe(200);

    const viewerManage = await addMember(
      userB,
      tripId,
      "user-d@example.com",
      "viewer",
    );
    const unrelatedManage = await addMember(
      userC,
      tripId,
      "user-d@example.com",
      "viewer",
    );
    expect(viewerManage.status).toBe(403);
    expect(unrelatedManage.status).toBe(404);

    const removeOwner = await browserDelete(
      app,
      `/api/trips/${tripId}/members/${userA.id}`,
    ).set("Cookie", userA.cookie);
    expect(removeOwner.status).toBe(409);
    expect(removeOwner.body.code).toBe("TRIP_OWNER_CANNOT_BE_REMOVED");
  });

  it("enforces membership SQL constraints and user cascade", async () => {
    const created = await createTrip(userA, { name: "Constraint QA" });
    const tripId = created.body.id as string;
    await addMember(userA, tripId, "user-b@example.com", "editor");

    await expect(
      pool.query(
        "INSERT INTO trip_members (trip_id, user_id, role) VALUES ($1, $2, 'viewer')",
        [tripId, userB.id],
      ),
    ).rejects.toMatchObject({ code: "23505" });
    await expect(
      pool.query(
        "INSERT INTO trip_members (trip_id, user_id, role) VALUES ($1, $2, 'viewer')",
        [UNKNOWN_TRIP_ID, userD.id],
      ),
    ).rejects.toMatchObject({ code: "23503" });
    await expect(
      pool.query(
        "INSERT INTO trip_members (trip_id, user_id, role) VALUES ($1, $2, 'viewer')",
        [tripId, UNKNOWN_USER_ID],
      ),
    ).rejects.toMatchObject({ code: "23503" });
    await expect(
      pool.query(
        "INSERT INTO trip_members (trip_id, user_id, role) VALUES ($1, $2, 'owner')",
        [tripId, userD.id],
      ),
    ).rejects.toMatchObject({ code: "22P02" });

    await pool.query("DELETE FROM users WHERE id = $1", [userB.id]);
    expect(
      (
        await pool.query(
          "SELECT 1 FROM trip_members WHERE trip_id = $1 AND user_id = $2",
          [tripId, userB.id],
        )
      ).rowCount,
    ).toBe(0);
  });
});
