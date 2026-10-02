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
import request, { type Response as SupertestResponse } from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { configureApplication } from "../src/common/configure-application";

const PASSWORD = "a sufficiently long password";
const WEB_ORIGIN = "http://127.0.0.1:3000";

type Identity = { cookie: string; email: string };
type TripFixture = {
  dayIds: string[];
  fromItemId: string;
  toItemId: string;
  tripId: string;
};

function browser(app: INestApplication, method: "post" | "patch" | "delete", path: string) {
  return request(app.getHttpServer())[method](path)
    .set("Origin", WEB_ORIGIN)
    .set("X-TripForge-Request", "1");
}

function cookie(response: SupertestResponse) {
  const header = response.headers["set-cookie"] as string[] | string;
  return (Array.isArray(header) ? header[0] : header).split(";", 1)[0] ?? "";
}

function providerResponse(distance = 2_400, duration = 1_860) {
  return new globalThis.Response(JSON.stringify({
    features: [{
      geometry: {
        coordinates: [[139.7967, 35.7148], [139.8107, 35.7101]],
        type: "LineString",
      },
      properties: { summary: { distance, duration } },
      type: "Feature",
    }],
    type: "FeatureCollection",
  }));
}

describe("Trip routes with PostgreSQL", () => {
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

  async function fixture(): Promise<TripFixture> {
    const trip = await browser(app, "post", "/api/trips")
      .set("Cookie", owner.cookie)
      .send({
        endsOn: "2027-04-13",
        name: "Tokyo",
        startsOn: "2027-04-12",
      });
    const days = await request(app.getHttpServer())
      .get(`/api/trips/${trip.body.id}/days`)
      .set("Cookie", owner.cookie);
    const itemInput = (dayId: string, title: string, latitude: number, longitude: number) => ({
      dayId,
      kind: "activity",
      place: {
        address: `${title}, Tokyo`,
        latitude,
        longitude,
        name: title,
        provider: "maptiler",
      },
      title,
    });
    const from = await browser(app, "post", `/api/trips/${trip.body.id}/itinerary-items`)
      .set("Cookie", owner.cookie)
      .send(itemInput(days.body[0].id, "Senso-ji", 35.7148, 139.7967));
    const to = await browser(app, "post", `/api/trips/${trip.body.id}/itinerary-items`)
      .set("Cookie", owner.cookie)
      .send(itemInput(days.body[0].id, "Tokyo Skytree", 35.7101, 139.8107));
    return {
      dayIds: days.body.map(({ id }: { id: string }) => id),
      fromItemId: from.body.id,
      toItemId: to.body.id,
      tripId: trip.body.id,
    };
  }

  async function createRoute(identity: Identity, data: TripFixture, reverse = false) {
    return browser(app, "post", `/api/trips/${data.tripId}/routes`)
      .set("Cookie", identity.cookie)
      .send({
        fromItemId: reverse ? data.toItemId : data.fromItemId,
        mode: "walking",
        toItemId: reverse ? data.fromItemId : data.toItemId,
      });
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
    process.env.OPENROUTESERVICE_API_KEY = "integration-secret";
    process.env.WEB_ORIGIN = WEB_ORIGIN;
    const { AppModule } = await import("../src/app.module");
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    configureApplication(app);
    await app.listen(0, "127.0.0.1");
    pool = new Pool({ connectionString: databaseUrl });
  });

  beforeEach(async () => {
    await pool.query("TRUNCATE TABLE auth_sessions, password_credentials, trip_route_segments, itinerary_items, trip_days, trip_destinations, trip_members, trips, users CASCADE");
    owner = await register("route-owner@example.com");
    editor = await register("route-editor@example.com");
    viewer = await register("route-viewer@example.com");
    outsider = await register("route-outsider@example.com");
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(providerResponse())));
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    await app?.close();
    await pool?.end();
    await container?.stop();
  });

  it("persists route snapshots, permits reverse routes, and enforces RBAC", async () => {
    const data = await fixture();
    await browser(app, "post", `/api/trips/${data.tripId}/members`)
      .set("Cookie", owner.cookie).send({ email: editor.email, role: "editor" });
    await browser(app, "post", `/api/trips/${data.tripId}/members`)
      .set("Cookie", owner.cookie).send({ email: viewer.email, role: "viewer" });

    const created = await createRoute(owner, data);
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      distanceMeters: 2400,
      durationSeconds: 1860,
      fromItemId: data.fromItemId,
      geometry: { type: "LineString" },
      mode: "walking",
      toItemId: data.toItemId,
    });
    expect(created.body).not.toHaveProperty("provider");

    const persisted = await pool.query("SELECT * FROM trip_route_segments WHERE id = $1", [created.body.id]);
    expect(persisted.rows[0]).toMatchObject({
      destination_latitude: 35.7101,
      destination_longitude: 139.8107,
      origin_latitude: 35.7148,
      origin_longitude: 139.7967,
      provider: "openrouteservice",
    });

    const duplicate = await createRoute(owner, data);
    const reverse = await createRoute(editor, data, true);
    const viewerCreate = await createRoute(viewer, data, true);
    const viewerList = await request(app.getHttpServer())
      .get(`/api/trips/${data.tripId}/routes`).set("Cookie", viewer.cookie);
    const outsiderList = await request(app.getHttpServer())
      .get(`/api/trips/${data.tripId}/routes`).set("Cookie", outsider.cookie);
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.code).toBe("ROUTE_ALREADY_EXISTS");
    expect(reverse.status).toBe(201);
    expect(viewerCreate.status).toBe(403);
    expect(viewerList.status).toBe(200);
    expect(viewerList.body).toHaveLength(2);
    expect(outsiderList.status).toBe(404);

    vi.mocked(fetch).mockResolvedValueOnce(providerResponse(3_100, 900));
    const recalculated = await browser(app, "patch", `/api/trips/${data.tripId}/routes/${created.body.id}`)
      .set("Cookie", editor.cookie).send({ mode: "cycling" });
    expect(recalculated.status).toBe(200);
    expect(recalculated.body).toMatchObject({ distanceMeters: 3100, durationSeconds: 900, mode: "cycling" });

    const viewerDelete = await browser(app, "delete", `/api/trips/${data.tripId}/routes/${created.body.id}`)
      .set("Cookie", viewer.cookie);
    const deleted = await browser(app, "delete", `/api/trips/${data.tripId}/routes/${created.body.id}`)
      .set("Cookie", editor.cookie);
    expect(viewerDelete.status).toBe(403);
    expect(deleted.status).toBe(204);
  });

  it("invalidates only coordinate-dependent routes and preserves routes across reorder", async () => {
    const data = await fixture();
    const created = await createRoute(owner, data);
    expect(created.status).toBe(201);

    const metadata = await browser(app, "patch", `/api/trips/${data.tripId}/itinerary-items/${data.fromItemId}`)
      .set("Cookie", owner.cookie).send({
        place: {
          address: "Updated address",
          latitude: 35.7148,
          longitude: 139.7967,
          name: "Updated Senso-ji",
          provider: "maptiler",
        },
      });
    expect(metadata.status).toBe(200);
    expect((await pool.query("SELECT id FROM trip_route_segments")).rows).toHaveLength(1);

    const reordered = await browser(app, "patch", `/api/trips/${data.tripId}/itinerary-items/reorder`)
      .set("Cookie", owner.cookie).send({
        days: [
          { dayId: data.dayIds[0], itemIds: [data.fromItemId] },
          { dayId: data.dayIds[1], itemIds: [data.toItemId] },
        ],
      });
    expect(reordered.status).toBe(200);
    expect((await pool.query("SELECT id FROM trip_route_segments")).rows).toHaveLength(1);

    const moved = await browser(app, "patch", `/api/trips/${data.tripId}/itinerary-items/${data.fromItemId}`)
      .set("Cookie", owner.cookie).send({
        place: {
          latitude: 35.72,
          longitude: 139.8,
          name: "Moved Senso-ji",
          provider: "maptiler",
        },
      });
    expect(moved.status).toBe(200);
    expect((await pool.query("SELECT id FROM trip_route_segments")).rows).toHaveLength(0);

    expect((await createRoute(owner, data)).status).toBe(201);
    const cleared = await browser(app, "patch", `/api/trips/${data.tripId}/itinerary-items/${data.fromItemId}`)
      .set("Cookie", owner.cookie).send({ place: null });
    expect(cleared.status).toBe(200);
    expect((await pool.query("SELECT id FROM trip_route_segments")).rows).toHaveLength(0);

    await browser(app, "patch", `/api/trips/${data.tripId}/itinerary-items/${data.fromItemId}`)
      .set("Cookie", owner.cookie).send({
        place: { latitude: 35.72, longitude: 139.8, name: "Senso-ji", provider: "maptiler" },
      });
    expect((await createRoute(owner, data)).status).toBe(201);
    const itemDeleted = await browser(app, "delete", `/api/trips/${data.tripId}/itinerary-items/${data.toItemId}`)
      .set("Cookie", owner.cookie);
    expect(itemDeleted.status).toBe(204);
    expect((await pool.query("SELECT id FROM trip_route_segments")).rows).toHaveLength(0);
  });

  it("rejects stale geometry when endpoint coordinates change during provider I/O", async () => {
    const data = await fixture();
    let releaseProvider: ((response: Response) => void) | undefined;
    let markStarted: (() => void) | undefined;
    const started = new Promise<void>((resolveStarted) => { markStarted = resolveStarted; });
    const providerResult = new Promise<Response>((resolveProvider) => { releaseProvider = resolveProvider; });
    vi.stubGlobal("fetch", vi.fn(() => {
      markStarted?.();
      return providerResult;
    }));

    const pendingRoute = createRoute(owner, data).then((response) => response);
    await started;
    const changed = await browser(app, "patch", `/api/trips/${data.tripId}/itinerary-items/${data.fromItemId}`)
      .set("Cookie", owner.cookie).send({
        place: { latitude: 35.75, longitude: 139.85, name: "Moved", provider: "maptiler" },
      });
    expect(changed.status).toBe(200);
    releaseProvider?.(providerResponse());

    const response = await pendingRoute;
    expect(response.status).toBe(409);
    expect(response.body.code).toBe("ROUTE_ENDPOINT_CHANGED");
    expect((await pool.query("SELECT id FROM trip_route_segments")).rows).toHaveLength(0);
  });

  it("enforces direct database checks, uniqueness, FKs, and Trip cascade", async () => {
    const data = await fixture();
    const values = [
      data.tripId,
      data.fromItemId,
      data.toItemId,
      JSON.stringify({ type: "LineString", coordinates: [[1, 1], [2, 2]] }),
    ];
    const insert = (overrides = "") => pool.query(
      `INSERT INTO trip_route_segments (trip_id, from_item_id, to_item_id, mode, distance_meters, duration_seconds, geometry, origin_latitude, origin_longitude, destination_latitude, destination_longitude, provider) VALUES ($1, $2, $3, 'walking', 10, 20, $4, 1, 1, 2, 2, 'openrouteservice') ${overrides}`,
      values,
    );
    await expect(pool.query(
      "INSERT INTO trip_route_segments (trip_id, from_item_id, to_item_id, mode, distance_meters, duration_seconds, geometry, origin_latitude, origin_longitude, destination_latitude, destination_longitude, provider) VALUES ($1, $2, $2, 'walking', 10, 20, $3, 1, 1, 2, 2, 'openrouteservice')",
      [data.tripId, data.fromItemId, values[3]],
    )).rejects.toMatchObject({ code: "23514" });
    await expect(pool.query(
      "INSERT INTO trip_route_segments (trip_id, from_item_id, to_item_id, mode, distance_meters, duration_seconds, geometry, origin_latitude, origin_longitude, destination_latitude, destination_longitude, provider) VALUES ($1, $2, $3, 'walking', -1, 20, $4, 1, 1, 2, 2, 'openrouteservice')",
      values,
    )).rejects.toMatchObject({ code: "23514" });
    await expect(pool.query(
      "INSERT INTO trip_route_segments (trip_id, from_item_id, to_item_id, mode, distance_meters, duration_seconds, geometry, origin_latitude, origin_longitude, destination_latitude, destination_longitude, provider) VALUES ($1, $2, $3, 'walking', 10, -1, $4, 1, 1, 2, 2, 'openrouteservice')",
      values,
    )).rejects.toMatchObject({ code: "23514" });
    await expect(pool.query(
      "INSERT INTO trip_route_segments (trip_id, from_item_id, to_item_id, mode, distance_meters, duration_seconds, geometry, origin_latitude, origin_longitude, destination_latitude, destination_longitude, provider) VALUES ($1, $2, $3, 'train', 10, 20, $4, 1, 1, 2, 2, 'openrouteservice')",
      values,
    )).rejects.toMatchObject({ code: "22P02" });
    await expect(pool.query(
      "INSERT INTO trip_route_segments (trip_id, from_item_id, to_item_id, mode, distance_meters, duration_seconds, geometry, origin_latitude, origin_longitude, destination_latitude, destination_longitude, provider) VALUES ($1, '00000000-0000-4000-8000-000000000002', $2, 'walking', 10, 20, $3, 1, 1, 2, 2, 'openrouteservice')",
      [data.tripId, data.toItemId, values[3]],
    )).rejects.toMatchObject({ code: "23503" });
    await insert();
    await expect(insert()).rejects.toMatchObject({ code: "23505" });
    await expect(pool.query(
      "INSERT INTO trip_route_segments (trip_id, from_item_id, to_item_id, mode, distance_meters, duration_seconds, geometry, origin_latitude, origin_longitude, destination_latitude, destination_longitude, provider) VALUES ('00000000-0000-4000-8000-000000000001', $1, $2, 'walking', 10, 20, $3, 1, 1, 2, 2, 'openrouteservice')",
      [data.fromItemId, data.toItemId, values[3]],
    )).rejects.toMatchObject({ code: "23503" });
    await pool.query("DELETE FROM trips WHERE id = $1", [data.tripId]);
    expect((await pool.query("SELECT id FROM trip_route_segments")).rows).toHaveLength(0);
  });
});
