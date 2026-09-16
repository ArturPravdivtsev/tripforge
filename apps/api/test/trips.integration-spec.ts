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

  async function createDestination(
    identity: TestIdentity,
    tripId: string,
    name: string,
  ): Promise<Response> {
    return browserPost(app, `/api/trips/${tripId}/destinations`)
      .set("Cookie", identity.cookie)
      .send({ name });
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
      "TRUNCATE TABLE auth_sessions, password_credentials, trip_days, trip_destinations, trip_members, trips, users CASCADE",
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

  it("creates the inclusive Day range atomically and skips partial ranges", async () => {
    const complete = await createTrip(userA, {
      endsOn: "2027-04-15",
      name: "Complete",
      startsOn: "2027-04-12",
    });
    const partial = await createTrip(userA, {
      name: "Partial",
      startsOn: "2027-05-01",
    });

    const completeDays = await pool.query<{
      date: string;
      trip_id: string;
    }>(
      "SELECT trip_id, date::text FROM trip_days WHERE trip_id = $1 ORDER BY date",
      [complete.body.id],
    );
    const partialDays = await pool.query(
      "SELECT 1 FROM trip_days WHERE trip_id = $1",
      [partial.body.id],
    );

    expect(completeDays.rows).toEqual(
      ["2027-04-12", "2027-04-13", "2027-04-14", "2027-04-15"].map(
        (date) => ({ date, trip_id: complete.body.id }),
      ),
    );
    expect(partialDays.rowCount).toBe(0);
  });

  it("reconciles extended, shrunk, shifted, and cleared ranges with stable Day IDs", async () => {
    const created = await createTrip(userA, {
      endsOn: "2027-04-14",
      name: "Reconcile",
      startsOn: "2027-04-12",
    });
    const tripId = created.body.id as string;
    const tokyo = await createDestination(userA, tripId, "Tokyo");
    const initial = await pool.query<{ date: string; id: string }>(
      "SELECT id, date::text FROM trip_days WHERE trip_id = $1 ORDER BY date",
      [tripId],
    );
    const april13 = initial.rows.find(({ date }) => date === "2027-04-13")!;
    await browserPatch(app, `/api/trips/${tripId}/days/${april13.id}`)
      .set("Cookie", userA.cookie)
      .send({ destinationId: tokyo.body.id });

    const extended = await browserPatch(app, `/api/trips/${tripId}`)
      .set("Cookie", userA.cookie)
      .send({ endsOn: "2027-04-16" });
    expect(extended.status).toBe(200);
    const afterExtend = await pool.query<{
      date: string;
      destination_id: string | null;
      id: string;
    }>(
      "SELECT id, date::text, destination_id FROM trip_days WHERE trip_id = $1 ORDER BY date",
      [tripId],
    );
    expect(afterExtend.rows.map(({ date }) => date)).toEqual([
      "2027-04-12",
      "2027-04-13",
      "2027-04-14",
      "2027-04-15",
      "2027-04-16",
    ]);
    expect(afterExtend.rows.slice(0, 3).map(({ id }) => id)).toEqual(
      initial.rows.map(({ id }) => id),
    );
    expect(
      afterExtend.rows.find(({ date }) => date === "2027-04-13")
        ?.destination_id,
    ).toBe(tokyo.body.id);

    const shifted = await browserPatch(app, `/api/trips/${tripId}`)
      .set("Cookie", userA.cookie)
      .send({ startsOn: "2027-04-13", endsOn: "2027-04-15" });
    expect(shifted.status).toBe(200);
    const afterShift = await pool.query<{
      date: string;
      destination_id: string | null;
      id: string;
    }>(
      "SELECT id, date::text, destination_id FROM trip_days WHERE trip_id = $1 ORDER BY date",
      [tripId],
    );
    expect(afterShift.rows.map(({ date }) => date)).toEqual([
      "2027-04-13",
      "2027-04-14",
      "2027-04-15",
    ]);
    for (const day of afterShift.rows) {
      expect(day.id).toBe(
        afterExtend.rows.find(({ date }) => date === day.date)?.id,
      );
    }
    expect(afterShift.rows[0]?.destination_id).toBe(tokyo.body.id);

    const cleared = await browserPatch(app, `/api/trips/${tripId}`)
      .set("Cookie", userA.cookie)
      .send({ startsOn: null });
    expect(cleared.status).toBe(200);
    expect(
      (await pool.query("SELECT 1 FROM trip_days WHERE trip_id = $1", [tripId]))
        .rowCount,
    ).toBe(0);
    expect(
      (
        await pool.query(
          "SELECT 1 FROM trip_destinations WHERE trip_id = $1",
          [tripId],
        )
      ).rowCount,
    ).toBe(1);
  });

  it("rolls back Trip date changes when Day reconciliation fails", async () => {
    const created = await createTrip(userA, {
      endsOn: "2027-04-14",
      name: "Rollback",
      startsOn: "2027-04-12",
    });
    const tripId = created.body.id as string;
    const before = await pool.query<{ date: string; id: string }>(
      "SELECT id, date::text FROM trip_days WHERE trip_id = $1 ORDER BY date",
      [tripId],
    );

    await pool.query(`
      CREATE FUNCTION reject_stage12_day() RETURNS trigger AS $$
      BEGIN
        IF NEW.date = DATE '2027-04-15' THEN
          RAISE EXCEPTION 'controlled Stage 12 reconciliation failure';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
      CREATE TRIGGER reject_stage12_day_trigger
      BEFORE INSERT ON trip_days
      FOR EACH ROW EXECUTE FUNCTION reject_stage12_day();
    `);

    try {
      const failed = await browserPatch(app, `/api/trips/${tripId}`)
        .set("Cookie", userA.cookie)
        .send({ endsOn: "2027-04-16" });
      expect(failed.status).toBe(500);

      const persistedTrip = await pool.query<{ ends_on: string }>(
        "SELECT ends_on::text FROM trips WHERE id = $1",
        [tripId],
      );
      const persistedDays = await pool.query<{ date: string; id: string }>(
        "SELECT id, date::text FROM trip_days WHERE trip_id = $1 ORDER BY date",
        [tripId],
      );
      expect(persistedTrip.rows[0]?.ends_on).toBe("2027-04-14");
      expect(persistedDays.rows).toEqual(before.rows);
    } finally {
      await pool.query("DROP TRIGGER reject_stage12_day_trigger ON trip_days");
      await pool.query("DROP FUNCTION reject_stage12_day()");
    }
  });

  it("enforces destination RBAC and atomic normalized reorder", async () => {
    const created = await createTrip(userA, { name: "Japan" });
    const tripId = created.body.id as string;
    await addMember(userA, tripId, "user-b@example.com", "editor");
    await addMember(userA, tripId, "user-c@example.com", "viewer");
    const tokyo = await createDestination(userA, tripId, "Tokyo");
    const kyoto = await createDestination(userB, tripId, "Kyoto");
    const osaka = await createDestination(userA, tripId, "Osaka");

    expect(tokyo.status).toBe(201);
    expect(kyoto.status).toBe(201);
    expect(osaka.body.position).toBe(2);
    for (const identity of [userA, userB, userC]) {
      const listed = await request(app.getHttpServer())
        .get(`/api/trips/${tripId}/destinations`)
        .set("Cookie", identity.cookie);
      expect(listed.status).toBe(200);
      expect(listed.body).toHaveLength(3);
    }
    const hidden = await request(app.getHttpServer())
      .get(`/api/trips/${tripId}/destinations`)
      .set("Cookie", userD.cookie);
    expect(hidden.status).toBe(404);

    const viewerCreate = await createDestination(userC, tripId, "Blocked");
    const unrelatedCreate = await createDestination(userD, tripId, "Hidden");
    expect(viewerCreate.status).toBe(403);
    expect(unrelatedCreate.status).toBe(404);

    const renamed = await browserPatch(
      app,
      `/api/trips/${tripId}/destinations/${kyoto.body.id}`,
    )
      .set("Cookie", userB.cookie)
      .send({ name: "  Kyoto City  " });
    expect(renamed.status).toBe(200);
    expect(renamed.body.name).toBe("Kyoto City");

    const desired = [osaka.body.id, tokyo.body.id, kyoto.body.id];
    const reordered = await browserPatch(
      app,
      `/api/trips/${tripId}/destinations/reorder`,
    )
      .set("Cookie", userB.cookie)
      .send({ destinationIds: desired });
    expect(reordered.status).toBe(200);
    expect(
      reordered.body.map(
        ({ id, position }: { id: string; position: number }) => [id, position],
      ),
    ).toEqual(desired.map((id, position) => [id, position]));

    for (const invalidOrder of [
      [osaka.body.id, osaka.body.id, kyoto.body.id],
      [osaka.body.id, tokyo.body.id],
      [osaka.body.id, tokyo.body.id, UNKNOWN_TRIP_ID],
    ]) {
      const invalid = await browserPatch(
        app,
        `/api/trips/${tripId}/destinations/reorder`,
      )
        .set("Cookie", userA.cookie)
        .send({ destinationIds: invalidOrder });
      expect(invalid.status).toBe(400);
      expect(invalid.body.code).toBe("INVALID_DESTINATION_ORDER");
    }
    const positions = await pool.query<{ id: string; position: number }>(
      "SELECT id, position FROM trip_destinations WHERE trip_id = $1 ORDER BY position, id",
      [tripId],
    );
    expect(positions.rows).toEqual(
      desired.map((id, position) => ({ id, position })),
    );
  });

  it("scopes Day assignments and clears them when deleting a destination", async () => {
    const tripA = await createTrip(userA, {
      endsOn: "2027-04-13",
      name: "Trip A",
      startsOn: "2027-04-12",
    });
    const tripB = await createTrip(userB, {
      endsOn: "2027-05-02",
      name: "Trip B",
      startsOn: "2027-05-01",
    });
    const tripAId = tripA.body.id as string;
    const tokyo = await createDestination(userA, tripAId, "Tokyo");
    const rome = await createDestination(userB, tripB.body.id, "Rome");
    await addMember(userA, tripAId, "user-b@example.com", "editor");
    await addMember(userA, tripAId, "user-c@example.com", "viewer");
    const days = await request(app.getHttpServer())
      .get(`/api/trips/${tripAId}/days`)
      .set("Cookie", userC.cookie);
    expect(days.status).toBe(200);
    const [dayOne, dayTwo] = days.body as Array<{ id: string }>;

    const assigned = await browserPatch(
      app,
      `/api/trips/${tripAId}/days/${dayOne!.id}`,
    )
      .set("Cookie", userB.cookie)
      .send({ destinationId: tokyo.body.id });
    const secondAssigned = await browserPatch(
      app,
      `/api/trips/${tripAId}/days/${dayTwo!.id}`,
    )
      .set("Cookie", userA.cookie)
      .send({ destinationId: tokyo.body.id });
    expect(assigned.status).toBe(200);
    expect(secondAssigned.status).toBe(200);

    const viewerMutation = await browserPatch(
      app,
      `/api/trips/${tripAId}/days/${dayOne!.id}`,
    )
      .set("Cookie", userC.cookie)
      .send({ destinationId: null });
    const unrelatedMutation = await browserPatch(
      app,
      `/api/trips/${tripAId}/days/${dayOne!.id}`,
    )
      .set("Cookie", userD.cookie)
      .send({ destinationId: null });
    const foreignDestination = await browserPatch(
      app,
      `/api/trips/${tripAId}/days/${dayOne!.id}`,
    )
      .set("Cookie", userA.cookie)
      .send({ destinationId: rome.body.id });
    expect(viewerMutation.status).toBe(403);
    expect(unrelatedMutation.status).toBe(404);
    expect(foreignDestination.status).toBe(404);
    expect(foreignDestination.body.code).toBe("DESTINATION_NOT_FOUND");

    const deleted = await browserDelete(
      app,
      `/api/trips/${tripAId}/destinations/${tokyo.body.id}`,
    ).set("Cookie", userB.cookie);
    expect(deleted.status).toBe(204);
    const persistedDays = await pool.query<{ destination_id: string | null }>(
      "SELECT destination_id FROM trip_days WHERE trip_id = $1 ORDER BY date",
      [tripAId],
    );
    expect(persistedDays.rows).toEqual([
      { destination_id: null },
      { destination_id: null },
    ]);
  });

  it("enforces destination/day constraints and Trip cascades in PostgreSQL", async () => {
    const tripA = await createTrip(userA, {
      endsOn: "2027-04-12",
      name: "Constraint A",
      startsOn: "2027-04-12",
    });
    const tripB = await createTrip(userB, {
      endsOn: "2027-05-01",
      name: "Constraint B",
      startsOn: "2027-05-01",
    });
    const destinationA = await createDestination(userA, tripA.body.id, "Tokyo");
    const destinationB = await createDestination(userB, tripB.body.id, "Rome");

    await expect(
      pool.query(
        "INSERT INTO trip_destinations (trip_id, name, position) VALUES ($1, '   ', 1)",
        [tripA.body.id],
      ),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      pool.query(
        "INSERT INTO trip_destinations (trip_id, name, position) VALUES ($1, 'Kyoto', -1)",
        [tripA.body.id],
      ),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      pool.query(
        "INSERT INTO trip_days (trip_id, date) VALUES ($1, '2027-04-12')",
        [tripA.body.id],
      ),
    ).rejects.toMatchObject({ code: "23505" });
    await expect(
      pool.query(
        "UPDATE trip_days SET destination_id = $1 WHERE trip_id = $2",
        [destinationB.body.id, tripA.body.id],
      ),
    ).rejects.toMatchObject({ code: "23503" });

    await pool.query(
      "UPDATE trip_days SET destination_id = $1 WHERE trip_id = $2",
      [destinationA.body.id, tripA.body.id],
    );
    await pool.query("DELETE FROM trips WHERE id = $1", [tripA.body.id]);
    expect(
      (
        await pool.query(
          "SELECT 1 FROM trip_destinations WHERE trip_id = $1",
          [tripA.body.id],
        )
      ).rowCount,
    ).toBe(0);
    expect(
      (
        await pool.query("SELECT 1 FROM trip_days WHERE trip_id = $1", [
          tripA.body.id,
        ])
      ).rowCount,
    ).toBe(0);
  });
});
