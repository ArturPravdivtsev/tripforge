import { resolve } from "node:path";

import { type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import request, { type Response } from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { configureApplication } from "../src/common/configure-application";
import * as schema from "../src/database/schema";
import { TripDocumentsRepository } from "../src/trips/trip-documents.repository";

const PASSWORD = "a sufficiently long password";
const WEB_ORIGIN = "http://127.0.0.1:3000";
const UNKNOWN_NOTIFICATION_ID = "00000000-0000-4000-8000-000000000001";

type Identity = { cookie: string; email: string; id: string };

describe("Persistent notifications with PostgreSQL", () => {
  let app: INestApplication;
  let container: StartedPostgreSqlContainer;
  let pool: Pool;
  let owner: Identity;
  let editor: Identity;
  let viewer: Identity;
  let outsider: Identity;

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
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    configureApplication(app);
    await app.init();
    pool = new Pool({ connectionString: databaseUrl });
  });

  beforeEach(async () => {
    await pool.query(
      "TRUNCATE TABLE auth_sessions, password_credentials, user_notifications, trip_documents, trip_expense_splits, trip_expenses, reservation_transport_details, trip_reservations, trip_members, trips, users CASCADE",
    );
    owner = await register("notify-owner@example.com", "Owner");
    editor = await register("notify-editor@example.com", "Editor");
    viewer = await register("notify-viewer@example.com", "Viewer");
    outsider = await register("notify-outsider@example.com", "Outsider");
  });

  afterAll(async () => {
    await app?.close();
    await pool?.end();
    await container?.stop();
  });

  it("lists only the recipient inbox with stable compound-cursor pagination", async () => {
    const tripId = await createTrip(owner, "Japan 2027");
    await addMember(owner, tripId, editor, "editor");

    const shared = await list(editor);
    expect(shared.status).toBe(200);
    expect(shared.body.items).toEqual([
      expect.objectContaining({
        data: { role: "editor" },
        target: { tripId, type: "trip" },
        trip: { id: tripId, name: "Japan 2027" },
        type: "trip_shared",
      }),
    ]);
    expect((await list(owner)).body.items).toEqual([]);
    expect((await list(outsider)).body.items).toEqual([]);

    await pool.query(
      `INSERT INTO user_notifications
        (user_id, type, trip_id, trip_name_snapshot, actor_user_id,
         actor_name_snapshot, payload, created_at)
       SELECT $1, 'reservation_added', $2, 'Japan 2027', $3, 'Owner',
         jsonb_build_object('type', 'reservation_added', 'data',
           jsonb_build_object('title', 'Reservation ' || value)),
         '2027-01-01T00:00:00.000Z'::timestamptz
       FROM generate_series(1, 25) AS value`,
      [editor.id, tripId, owner.id],
    );

    const first = await list(editor, { limit: 10 });
    const second = await list(editor, {
      cursor: first.body.nextCursor as string,
      limit: 10,
    });
    const third = await list(editor, {
      cursor: second.body.nextCursor as string,
      limit: 10,
    });
    const ids = [first, second, third].flatMap(
      (page) => (page.body.items as Array<{ id: string }>).map(({ id }) => id),
    );
    expect(ids).toHaveLength(26);
    expect(new Set(ids).size).toBe(26);
    expect(third.body.nextCursor).toBeNull();

    const malformed = await list(editor, { cursor: "not+base64" });
    expect(malformed.status).toBe(400);
    expect(malformed.body.code).toBe("INVALID_NOTIFICATION_CURSOR");
    const tooLarge = await list(editor, { limit: 51 });
    expect(tooLarge.status).toBe(400);
  });

  it("keeps read state idempotent, user-owned, and synchronizes read-all", async () => {
    const tripId = await createTrip(owner, "Read states");
    await addMember(owner, tripId, viewer, "viewer");
    await changeRole(owner, tripId, viewer.id, "editor");
    const inbox = await list(viewer);
    const ids = (inbox.body.items as Array<{ id: string }>).map(({ id }) => id);
    expect((await unreadCount(viewer)).body).toEqual({ unreadCount: 2 });

    const firstRead = await updateRead(viewer, ids[0]!, true);
    const repeatedRead = await updateRead(viewer, ids[0]!, true);
    expect(firstRead.status).toBe(200);
    expect(repeatedRead.status).toBe(200);
    expect(repeatedRead.body.readAt).toBe(firstRead.body.readAt);
    for (const read of [false, false]) {
      const response = await updateRead(viewer, ids[0]!, read);
      expect(response.status).toBe(200);
      expect(response.body.readAt).toBeNull();
    }
    expect((await unreadCount(viewer)).body).toEqual({ unreadCount: 2 });
    const foreign = await updateRead(outsider, ids[0]!, true);
    const unknown = await updateRead(viewer, UNKNOWN_NOTIFICATION_ID, true);
    expect(foreign.status).toBe(404);
    expect(foreign.body.code).toBe("NOTIFICATION_NOT_FOUND");
    expect(unknown.status).toBe(404);

    const readAll = await browserPost("/api/notifications/read-all", viewer.cookie);
    expect(readAll.status).toBe(201);
    expect(readAll.body).toEqual({ updatedCount: 2 });
    expect((await unreadCount(viewer)).body).toEqual({ unreadCount: 0 });
    const repeated = await browserPost("/api/notifications/read-all", viewer.cookie);
    expect(repeated.body).toEqual({ updatedCount: 0 });
  });

  it("preserves snapshots and notifications after role changes, revoke, and delete", async () => {
    const tripId = await createTrip(owner, "Japan 2027");
    await addMember(owner, tripId, viewer, "viewer");
    await browserPatch(`/api/trips/${tripId}`, owner.cookie).send({
      name: "Japan Adventure",
    });
    await changeRole(owner, tripId, viewer.id, "viewer");
    expect((await list(viewer)).body.items).toHaveLength(1);
    await changeRole(owner, tripId, viewer.id, "editor");
    await browserDelete(`/api/trips/${tripId}/members/${viewer.id}`, owner.cookie);

    const afterRevoke = await list(viewer);
    expect(afterRevoke.status).toBe(200);
    expect(afterRevoke.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          target: null,
          trip: { id: tripId, name: "Japan 2027" },
          type: "trip_shared",
        }),
        expect.objectContaining({
          data: { nextRole: "editor", previousRole: "viewer" },
          target: null,
          trip: { id: tripId, name: "Japan Adventure" },
          type: "trip_role_changed",
        }),
        expect.objectContaining({
          target: null,
          type: "trip_access_revoked",
        }),
      ]),
    );

    await addMember(owner, tripId, editor, "editor");
    const deleted = await browserDelete(`/api/trips/${tripId}`, owner.cookie);
    expect(deleted.status).toBe(204);
    const deleteNotification = await pool.query<{
      trip_id: string | null;
      trip_name_snapshot: string;
    }>(
      "SELECT trip_id, trip_name_snapshot FROM user_notifications WHERE user_id = $1 AND type = 'trip_deleted'",
      [editor.id],
    );
    expect(deleteNotification.rows).toEqual([
      { trip_id: null, trip_name_snapshot: "Japan Adventure" },
    ]);
  });

  it("fans out creation notifications to current participants except the actor", async () => {
    const tripId = await createTrip(owner, "Fanout");
    await addMember(owner, tripId, editor, "editor");
    await addMember(owner, tripId, viewer, "viewer");
    await pool.query("DELETE FROM user_notifications");

    const reservation = await browserPost(
      `/api/trips/${tripId}/reservations`,
      owner.cookie,
    ).send({
      kind: "accommodation",
      startDate: "2027-04-12",
      status: "confirmed",
      title: "Hotel Gracery",
    });
    expect(reservation.status).toBe(201);

    const expense = await browserPost(`/api/trips/${tripId}/expenses`, editor.cookie).send({
      amountMinor: 12_500,
      category: "food",
      currency: "EUR",
      paidByUserId: editor.id,
      spentOn: "2027-04-13",
      split: {
        method: "equal",
        participantUserIds: [owner.id, editor.id, viewer.id],
      },
      title: "Dinner in Kyoto",
    });
    expect(expense.status).toBe(201);

    const rows = await pool.query<{
      payload: { data: Record<string, unknown> };
      type: string;
      user_id: string;
    }>(
      "SELECT user_id, type, payload FROM user_notifications ORDER BY type, user_id",
    );
    expect(rows.rows.filter(({ type }) => type === "reservation_added")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ user_id: editor.id }),
        expect.objectContaining({ user_id: viewer.id }),
      ]),
    );
    expect(
      rows.rows.some(
        ({ type, user_id }) =>
          type === "reservation_added" && user_id === owner.id,
      ),
    ).toBe(false);
    expect(rows.rows.filter(({ type }) => type === "expense_added")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ user_id: owner.id }),
        expect.objectContaining({ user_id: viewer.id }),
      ]),
    );
    expect(
      rows.rows.some(
        ({ payload }) => Object.hasOwn(payload.data, "amountMinor"),
      ),
    ).toBe(false);

    await browserDelete(`/api/trips/${tripId}/members/${viewer.id}`, owner.cookie);
    await pool.query("DELETE FROM user_notifications WHERE user_id = $1", [viewer.id]);
    const later = await browserPost(
      `/api/trips/${tripId}/reservations`,
      owner.cookie,
    ).send({
      kind: "activity",
      startDate: "2027-04-14",
      status: "confirmed",
      title: "Tea ceremony",
    });
    expect(later.status).toBe(201);
    expect((await list(viewer)).body.items).toEqual([]);
  });

  it("enforces recipient, enum, snapshot, and JSON payload constraints", async () => {
    const tripId = await createTrip(owner, "Database constraints");
    const insert = (
      recipientId: string,
      type: string,
      tripName: string,
      actorName: string | null,
      payload: string,
    ) =>
      pool.query(
        `INSERT INTO user_notifications
          (user_id, type, trip_id, trip_name_snapshot, actor_user_id,
           actor_name_snapshot, payload)
         VALUES ($1, $2::user_notification_type, $3, $4, $5, $6, $7::jsonb)`,
        [recipientId, type, tripId, tripName, owner.id, actorName, payload],
      );

    await expect(
      insert(
        UNKNOWN_NOTIFICATION_ID,
        "trip_shared",
        "Database constraints",
        "Owner",
        '{"type":"trip_shared","data":{"role":"viewer"}}',
      ),
    ).rejects.toMatchObject({ code: "23503" });
    await expect(
      insert(
        viewer.id,
        "unknown_type",
        "Database constraints",
        "Owner",
        "{}",
      ),
    ).rejects.toMatchObject({ code: "22P02" });
    await expect(
      insert(
        viewer.id,
        "trip_shared",
        "   ",
        "Owner",
        '{"type":"trip_shared","data":{"role":"viewer"}}',
      ),
    ).rejects.toMatchObject({
      constraint: "user_notifications_trip_name_not_blank_check",
    });
    await expect(
      insert(
        viewer.id,
        "trip_shared",
        "Database constraints",
        "   ",
        '{"type":"trip_shared","data":{"role":"viewer"}}',
      ),
    ).rejects.toMatchObject({
      constraint: "user_notifications_actor_name_not_blank_check",
    });
    await expect(
      insert(
        viewer.id,
        "trip_shared",
        "Database constraints",
        "Owner",
        "[]",
      ),
    ).rejects.toMatchObject({
      constraint: "user_notifications_payload_object_check",
    });
  });

  it("creates document-ready once and rolls back membership if notification insert fails", async () => {
    const tripId = await createTrip(owner, "Atomic");
    await addMember(owner, tripId, editor, "editor");
    await pool.query("DELETE FROM user_notifications");
    const document = await pool.query<{ id: string }>(
      `INSERT INTO trip_documents
        (id, trip_id, kind, title, original_file_name, content_type,
         size_bytes, storage_key, uploaded_by_user_id)
       VALUES (gen_random_uuid(), $1, 'ticket', 'Flight tickets', 'tickets.pdf',
         'application/pdf', 42, 'opaque-document-key', $2)
       RETURNING id`,
      [tripId, owner.id],
    );
    const repository = new TripDocumentsRepository(drizzle(pool, { schema }));
    const first = await repository.markReady(
      tripId,
      document.rows[0]!.id,
      owner.id,
      "etag",
    );
    const second = await repository.markReady(
      tripId,
      document.rows[0]!.id,
      owner.id,
      "etag",
    );
    expect(first?.notificationUserIds).toEqual([editor.id]);
    expect(second).toBeUndefined();
    const documentNotifications = await pool.query<{ total: number }>(
      "SELECT count(*)::int AS total FROM user_notifications WHERE type = 'document_ready'",
    );
    expect(documentNotifications.rows[0]?.total).toBe(1);

    await pool.query(`CREATE FUNCTION fail_notification_insert() RETURNS trigger
      LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'forced notification failure'; END $$`);
    await pool.query(`CREATE TRIGGER fail_notification_insert
      BEFORE INSERT ON user_notifications FOR EACH ROW
      EXECUTE FUNCTION fail_notification_insert()`);
    try {
      const failed = await addMember(owner, tripId, viewer, "viewer");
      expect(failed.status).toBe(500);
      const membership = await pool.query(
        "SELECT user_id FROM trip_members WHERE trip_id = $1 AND user_id = $2",
        [tripId, viewer.id],
      );
      expect(membership.rowCount).toBe(0);
    } finally {
      await pool.query("DROP TRIGGER fail_notification_insert ON user_notifications");
      await pool.query("DROP FUNCTION fail_notification_insert() ");
    }
  });

  async function register(email: string, displayName: string): Promise<Identity> {
    const response = await browserPost("/api/auth/register").send({
      displayName,
      email,
      password: PASSWORD,
    });
    expect(response.status).toBe(201);
    return { cookie: sessionCookie(response), email, id: response.body.user.id as string };
  }

  async function createTrip(identity: Identity, name: string): Promise<string> {
    const response = await browserPost("/api/trips", identity.cookie).send({ name });
    expect(response.status).toBe(201);
    return response.body.id as string;
  }

  async function addMember(
    identity: Identity,
    tripId: string,
    member: Identity,
    role: "editor" | "viewer",
  ): Promise<Response> {
    return browserPost(`/api/trips/${tripId}/members`, identity.cookie).send({
      email: member.email,
      role,
    });
  }

  async function changeRole(
    identity: Identity,
    tripId: string,
    userId: string,
    role: "editor" | "viewer",
  ): Promise<Response> {
    return browserPatch(
      `/api/trips/${tripId}/members/${userId}`,
      identity.cookie,
    ).send({ role });
  }

  function list(identity: Identity, query: { cursor?: string; limit?: number } = {}) {
    const params = new URLSearchParams();
    if (query.cursor) params.set("cursor", query.cursor);
    if (query.limit) params.set("limit", String(query.limit));
    const suffix = params.size > 0 ? `?${params.toString()}` : "";
    return request(app.getHttpServer())
      .get(`/api/notifications${suffix}`)
      .set("Cookie", identity.cookie);
  }

  function unreadCount(identity: Identity) {
    return request(app.getHttpServer())
      .get("/api/notifications/unread-count")
      .set("Cookie", identity.cookie);
  }

  function updateRead(identity: Identity, id: string, read: boolean) {
    return browserPatch(`/api/notifications/${id}`, identity.cookie).send({ read });
  }

  function browserPost(path: string, cookie?: string) {
    const pending = request(app.getHttpServer())
      .post(path)
      .set("Origin", WEB_ORIGIN)
      .set("X-TripForge-Request", "1");
    return cookie ? pending.set("Cookie", cookie) : pending;
  }

  function browserPatch(path: string, cookie: string) {
    return request(app.getHttpServer())
      .patch(path)
      .set("Cookie", cookie)
      .set("Origin", WEB_ORIGIN)
      .set("X-TripForge-Request", "1");
  }

  function browserDelete(path: string, cookie: string) {
    return request(app.getHttpServer())
      .delete(path)
      .set("Cookie", cookie)
      .set("Origin", WEB_ORIGIN)
      .set("X-TripForge-Request", "1");
  }
});

function sessionCookie(response: Response): string {
  const header = response.headers["set-cookie"] as string | string[] | undefined;
  const value = Array.isArray(header) ? header[0] : header;
  const cookie = value?.split(";", 1)[0];
  if (!cookie) throw new Error("Session cookie missing");
  return cookie;
}
