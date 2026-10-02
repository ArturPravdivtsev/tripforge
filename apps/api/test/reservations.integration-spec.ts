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

type Identity = { cookie: string; email: string };
type Fixture = { itemId: string; tripId: string };

function browser(app: INestApplication, method: "delete" | "patch" | "post", path: string) {
  return request(app.getHttpServer())[method](path)
    .set("Origin", WEB_ORIGIN)
    .set("X-TripForge-Request", "1");
}

function cookie(response: Response) {
  const value = response.headers["set-cookie"] as string | string[] | undefined;
  const first = Array.isArray(value) ? value[0] : value;
  if (!first) throw new Error("Missing session cookie");
  return first.split(";", 1)[0] ?? "";
}

describe("Trip reservations with PostgreSQL", () => {
  let app: INestApplication;
  let container: StartedPostgreSqlContainer;
  let pool: Pool;
  let owner: Identity;
  let editor: Identity;
  let viewer: Identity;
  let outsider: Identity;

  async function register(email: string): Promise<Identity> {
    const response = await browser(app, "post", "/api/auth/register").send({
      email,
      password: PASSWORD,
    });
    expect(response.status).toBe(201);
    return { cookie: cookie(response), email };
  }

  async function fixture(name = "Japan"): Promise<Fixture> {
    const trip = await browser(app, "post", "/api/trips")
      .set("Cookie", owner.cookie)
      .send({
        endsOn: "2027-04-16",
        name,
        startsOn: "2027-04-12",
      });
    const days = await request(app.getHttpServer())
      .get(`/api/trips/${trip.body.id}/days`)
      .set("Cookie", owner.cookie);
    const item = await browser(
      app,
      "post",
      `/api/trips/${trip.body.id}/itinerary-items`,
    )
      .set("Cookie", owner.cookie)
      .send({
        dayId: days.body[0].id,
        kind: "accommodation",
        title: "Hotel check-in",
      });
    return { itemId: item.body.id, tripId: trip.body.id };
  }

  async function createReservation(
    identity: Identity,
    tripId: string,
    input: Record<string, unknown>,
  ) {
    return browser(app, "post", `/api/trips/${tripId}/reservations`)
      .set("Cookie", identity.cookie)
      .send(input);
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
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    configureApplication(app);
    await app.listen(0, "127.0.0.1");
    pool = new Pool({ connectionString: databaseUrl });
  });

  beforeEach(async () => {
    await pool.query(
      "TRUNCATE TABLE auth_sessions, password_credentials, reservation_transport_details, trip_reservations, trip_route_segments, itinerary_items, trip_days, trip_destinations, trip_members, trips, users CASCADE",
    );
    owner = await register("reservation-owner@example.com");
    editor = await register("reservation-editor@example.com");
    viewer = await register("reservation-viewer@example.com");
    outsider = await register("reservation-outsider@example.com");
  });

  afterAll(async () => {
    await app?.close();
    await pool?.end();
    await container?.stop();
  });

  it("persists accommodation, restaurant, and typed transport in schedule order", async () => {
    const data = await fixture();
    const hotel = await createReservation(owner, data.tripId, {
      confirmationCode: "ABC123",
      endDate: "2027-04-16",
      endTime: "11:00",
      itineraryItemId: data.itemId,
      kind: "accommodation",
      providerName: "Booking.com",
      startDate: "2027-04-12",
      startTime: "15:00",
      status: "confirmed",
      title: "Hotel Gracery Shinjuku",
    });
    const dinner = await createReservation(owner, data.tripId, {
      kind: "restaurant",
      startDate: "2027-04-14",
      startTime: "19:30",
      status: "confirmed",
      title: "Dinner",
    });
    const train = await createReservation(owner, data.tripId, {
      kind: "transport",
      startDate: "2027-04-14",
      startTime: "08:03",
      status: "confirmed",
      title: "Shinkansen Tokyo → Kyoto",
      transport: {
        destinationName: "Kyoto Station",
        mode: "train",
        operatorName: "JR Central",
        originName: "Tokyo Station",
        serviceNumber: "Nozomi 215",
      },
    });

    expect([hotel.status, dinner.status, train.status]).toEqual([201, 201, 201]);
    expect(hotel.body).toMatchObject({
      confirmationCode: "ABC123",
      endTime: "11:00",
      itineraryItemId: data.itemId,
      startTime: "15:00",
      transport: null,
    });
    expect(train.body.transport).toEqual({
      destinationName: "Kyoto Station",
      mode: "train",
      operatorName: "JR Central",
      originName: "Tokyo Station",
      serviceNumber: "Nozomi 215",
    });
    expect(
      (await pool.query("SELECT * FROM reservation_transport_details")).rows,
    ).toHaveLength(1);

    const list = await request(app.getHttpServer())
      .get(`/api/trips/${data.tripId}/reservations`)
      .set("Cookie", owner.cookie);
    expect(list.body.map(({ title }: { title: string }) => title)).toEqual([
      "Hotel Gracery Shinjuku",
      "Shinkansen Tokyo → Kyoto",
      "Dinner",
    ]);
    const detail = await request(app.getHttpServer())
      .get(`/api/trips/${data.tripId}/reservations/${train.body.id}`)
      .set("Cookie", owner.cookie);
    expect(detail.body).toEqual(train.body);
  });

  it("changes subtype transactionally and preserves existing state after invalid PATCH", async () => {
    const data = await fixture();
    const created = await createReservation(owner, data.tripId, {
      kind: "restaurant",
      startDate: "2027-04-14",
      startTime: "19:30",
      status: "pending",
      title: "Dinner",
    });
    const invalid = await browser(
      app,
      "patch",
      `/api/trips/${data.tripId}/reservations/${created.body.id}`,
    )
      .set("Cookie", owner.cookie)
      .send({ kind: "transport" });
    expect(invalid.status).toBe(400);
    expect(invalid.body.code).toBe("INVALID_RESERVATION_DETAILS");
    expect(
      (
        await pool.query("SELECT kind FROM trip_reservations WHERE id = $1", [
          created.body.id,
        ])
      ).rows[0].kind,
    ).toBe("restaurant");

    const toTransport = await browser(
      app,
      "patch",
      `/api/trips/${data.tripId}/reservations/${created.body.id}`,
    )
      .set("Cookie", owner.cookie)
      .send({
        kind: "transport",
        transport: {
          destinationName: "Kyoto Station",
          mode: "train",
          originName: "Tokyo Station",
        },
      });
    expect(toTransport.status).toBe(200);
    expect(toTransport.body.transport.mode).toBe("train");

    const toActivity = await browser(
      app,
      "patch",
      `/api/trips/${data.tripId}/reservations/${created.body.id}`,
    )
      .set("Cookie", owner.cookie)
      .send({ kind: "activity" });
    expect(toActivity.status).toBe(200);
    expect(toActivity.body.transport).toBeNull();
    expect(
      (
        await pool.query(
          "SELECT reservation_id FROM reservation_transport_details WHERE reservation_id = $1",
          [created.body.id],
        )
      ).rows,
    ).toHaveLength(0);

    const empty = await browser(
      app,
      "patch",
      `/api/trips/${data.tripId}/reservations/${created.body.id}`,
    )
      .set("Cookie", owner.cookie)
      .send({});
    expect(empty.status).toBe(400);
    expect(empty.body.code).toBe("EMPTY_RESERVATION_UPDATE");
  });

  it("enforces scoped links, SET NULL, RBAC, and scoped detail lookup", async () => {
    const data = await fixture();
    const foreign = await fixture("Other trip");
    await browser(app, "post", `/api/trips/${data.tripId}/members`)
      .set("Cookie", owner.cookie)
      .send({ email: editor.email, role: "editor" });
    await browser(app, "post", `/api/trips/${data.tripId}/members`)
      .set("Cookie", owner.cookie)
      .send({ email: viewer.email, role: "viewer" });

    const wrongLink = await createReservation(owner, data.tripId, {
      itineraryItemId: foreign.itemId,
      kind: "activity",
      startDate: "2027-04-11",
      status: "pending",
      title: "Early arrival",
    });
    expect(wrongLink.status).toBe(404);
    expect(wrongLink.body.code).toBe("ITINERARY_ITEM_NOT_FOUND");

    const created = await createReservation(editor, data.tripId, {
      itineraryItemId: data.itemId,
      kind: "activity",
      startDate: "2027-04-11",
      status: "pending",
      title: "Early arrival",
    });
    expect(created.status).toBe(201);
    expect(
      await createReservation(viewer, data.tripId, {
        kind: "other",
        startDate: "2027-04-12",
        status: "pending",
        title: "Blocked",
      }),
    ).toMatchObject({ status: 403 });

    const viewerList = await request(app.getHttpServer())
      .get(`/api/trips/${data.tripId}/reservations`)
      .set("Cookie", viewer.cookie);
    const outsiderList = await request(app.getHttpServer())
      .get(`/api/trips/${data.tripId}/reservations`)
      .set("Cookie", outsider.cookie);
    const foreignDetail = await request(app.getHttpServer())
      .get(`/api/trips/${data.tripId}/reservations/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa`)
      .set("Cookie", owner.cookie);
    expect(viewerList.status).toBe(200);
    expect(viewerList.body[0].confirmationCode).toBeNull();
    expect(outsiderList.status).toBe(404);
    expect(foreignDetail.status).toBe(404);
    expect(foreignDetail.body.code).toBe("RESERVATION_NOT_FOUND");

    const deletedItem = await browser(
      app,
      "delete",
      `/api/trips/${data.tripId}/itinerary-items/${data.itemId}`,
    ).set("Cookie", owner.cookie);
    expect(deletedItem.status).toBe(204);
    const surviving = await request(app.getHttpServer())
      .get(`/api/trips/${data.tripId}/reservations/${created.body.id}`)
      .set("Cookie", owner.cookie);
    expect(surviving.status).toBe(200);
    expect(surviving.body.itineraryItemId).toBeNull();
  });

  it("enforces direct DB constraints and cascades reservation subtypes", async () => {
    const data = await fixture();
    const base = [
      data.tripId,
      "activity",
      "pending",
      "Valid title",
      "2027-04-12",
    ];
    const insert =
      "INSERT INTO trip_reservations (trip_id, kind, status, title, start_date) VALUES ($1, $2, $3, $4, $5)";
    await expect(pool.query(insert, [data.tripId, "activity", "pending", "   ", "2027-04-12"]))
      .rejects.toMatchObject({ code: "23514" });
    await expect(pool.query(insert, [data.tripId, "invalid", "pending", "Title", "2027-04-12"]))
      .rejects.toMatchObject({ code: "22P02" });
    await expect(
      pool.query(
        "INSERT INTO trip_reservations (trip_id, kind, status, title, start_date, end_date) VALUES ($1, $2, $3, $4, $5, $6)",
        [...base, "2027-04-11"],
      ),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      pool.query(
        "INSERT INTO trip_reservations (trip_id, kind, status, title, start_date, end_time) VALUES ($1, $2, $3, $4, $5, $6)",
        [...base, "11:00"],
      ),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      pool.query(insert, [
        "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        "activity",
        "pending",
        "Title",
        "2027-04-12",
      ]),
    ).rejects.toMatchObject({ code: "23503" });
    await expect(
      pool.query(
        "INSERT INTO trip_reservations (trip_id, itinerary_item_id, kind, status, title, start_date) VALUES ($1, $2, $3, $4, $5, $6)",
        [
          data.tripId,
          "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          "activity",
          "pending",
          "Title",
          "2027-04-12",
        ],
      ),
    ).rejects.toMatchObject({ code: "23503" });

    const transport = await createReservation(owner, data.tripId, {
      kind: "transport",
      startDate: "2027-04-14",
      status: "confirmed",
      title: "Train",
      transport: {
        destinationName: "Kyoto",
        mode: "train",
        originName: "Tokyo",
      },
    });
    expect(transport.status).toBe(201);
    const deleted = await browser(
      app,
      "delete",
      `/api/trips/${data.tripId}/reservations/${transport.body.id}`,
    ).set("Cookie", owner.cookie);
    expect(deleted.status).toBe(204);
    expect(
      (
        await pool.query(
          "SELECT reservation_id FROM reservation_transport_details WHERE reservation_id = $1",
          [transport.body.id],
        )
      ).rows,
    ).toHaveLength(0);

    const again = await createReservation(owner, data.tripId, {
      kind: "transport",
      startDate: "2027-04-14",
      status: "confirmed",
      title: "Train",
      transport: {
        destinationName: "Kyoto",
        mode: "train",
        originName: "Tokyo",
      },
    });
    await browser(app, "delete", `/api/trips/${data.tripId}`)
      .set("Cookie", owner.cookie);
    expect(
      (
        await pool.query("SELECT id FROM trip_reservations WHERE id = $1", [
          again.body.id,
        ])
      ).rows,
    ).toHaveLength(0);
    expect(
      (
        await pool.query(
          "SELECT reservation_id FROM reservation_transport_details WHERE reservation_id = $1",
          [again.body.id],
        )
      ).rows,
    ).toHaveLength(0);
  });
});
