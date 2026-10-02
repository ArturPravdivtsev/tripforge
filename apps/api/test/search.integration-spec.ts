import { randomUUID } from "node:crypto";
import { resolve } from "node:path";

import { type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import type { TripSearchResult } from "@tripforge/contracts";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import request, { type Response } from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { configureApplication } from "../src/common/configure-application";

const PASSWORD = "a sufficiently long password";
const WEB_ORIGIN = "http://127.0.0.1:3000";

type Identity = { cookie: string; email: string; id: string };
type SearchFixture = {
  documentId: string;
  destinationId: string;
  expenseId: string;
  itineraryId: string;
  reservationId: string;
  tripId: string;
};

function mutation(app: INestApplication, path: string) {
  return request(app.getHttpServer())
    .post(path)
    .set("Origin", WEB_ORIGIN)
    .set("X-TripForge-Request", "1");
}

function sessionCookie(response: Response): string {
  const value = response.headers["set-cookie"] as string | string[] | undefined;
  const first = Array.isArray(value) ? value[0] : value;
  if (!first) throw new Error("Missing session cookie");
  return first.split(";", 1)[0] ?? "";
}

describe("Trip search with PostgreSQL", () => {
  let app: INestApplication;
  let container: StartedPostgreSqlContainer;
  let pool: Pool;
  let owner: Identity;
  let editor: Identity;
  let viewer: Identity;
  let outsider: Identity;

  async function register(email: string): Promise<Identity> {
    const response = await mutation(app, "/api/auth/register").send({
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

  async function createTrip(identity: Identity, name = "Search fixture") {
    const response = await mutation(app, "/api/trips")
      .set("Cookie", identity.cookie)
      .send({ endsOn: "2027-04-16", name, startsOn: "2027-04-12" });
    expect(response.status).toBe(201);
    return response.body.id as string;
  }

  async function addMember(
    tripId: string,
    identity: Identity,
    role: "editor" | "viewer",
  ) {
    const response = await mutation(app, `/api/trips/${tripId}/members`)
      .set("Cookie", owner.cookie)
      .send({ email: identity.email, role });
    expect(response.status).toBe(201);
  }

  async function seedFixture(): Promise<SearchFixture> {
    const tripId = await createTrip(owner);
    await addMember(tripId, editor, "editor");
    await addMember(tripId, viewer, "viewer");
    const day = await pool.query<{ id: string }>(
      "SELECT id FROM trip_days WHERE trip_id = $1 ORDER BY date LIMIT 1",
      [tripId],
    );
    const dayId = day.rows[0]?.id;
    if (!dayId) throw new Error("Trip day was not generated");

    const destination = await pool.query<{ id: string }>(
      "INSERT INTO trip_destinations (trip_id, name, latitude, longitude, position) VALUES ($1, 'Kyoto', 35.0116, 135.7681, 0) RETURNING id",
      [tripId],
    );
    const itinerary = await pool.query<{ id: string }>(
      `INSERT INTO itinerary_items (
        trip_day_id, kind, title, start_time, notes, place_name, place_address,
        place_latitude, place_longitude, place_provider, place_provider_ref, position
      ) VALUES ($1, 'activity', 'Tea ceremony', '10:30', 'matchnote garden visit',
        'Gion Hall', 'Hanamikoji Lane', 35.003, 135.775, 'maptiler', 'gion-hall', 0)
      RETURNING id`,
      [dayId],
    );
    const reservation = await pool.query<{ id: string }>(
      `INSERT INTO trip_reservations (
        trip_id, kind, status, title, provider_name, confirmation_code,
        start_date, start_time, location_name, notes
      ) VALUES ($1, 'transport', 'confirmed', 'Night train', 'Railway West',
        'DO-NOT-SEARCH-992', '2027-04-14', '21:00', 'Tokyo Station', 'Sleeper cabin')
      RETURNING id`,
      [tripId],
    );
    const reservationId = reservation.rows[0]?.id;
    if (!reservationId) throw new Error("Reservation was not inserted");
    await pool.query(
      `INSERT INTO reservation_transport_details (
        reservation_id, mode, operator_name, service_number, origin_name, destination_name
      ) VALUES ($1, 'train', 'Sunrise Rail', 'JR42', 'Kyoto Depot', 'Tokyo Central')`,
      [reservationId],
    );
    const expense = await pool.query<{ id: string }>(
      `INSERT INTO trip_expenses (
        trip_id, title, category, spent_on, currency, amount_minor,
        paid_by_user_id, split_method, notes
      ) VALUES ($1, 'Sushi dinner', 'food', '2027-04-13', 'EUR', 12000,
        $2, 'equal', 'Omakase tasting') RETURNING id`,
      [tripId, owner.id],
    );
    const documentId = randomUUID();
    await pool.query(
      `INSERT INTO trip_documents (
        id, trip_id, kind, status, title, original_file_name, content_type,
        size_bytes, storage_key, uploaded_by_user_id, ready_at
      ) VALUES ($1, $2, 'ticket', 'ready', 'Rail pass', 'voucher-zen.pdf',
        'application/pdf', 10, 'hidden-storage-token', $3, now())`,
      [documentId, tripId, owner.id],
    );
    await pool.query(
      `INSERT INTO trip_documents (
        id, trip_id, kind, status, title, original_file_name, content_type,
        size_bytes, storage_key, uploaded_by_user_id
      ) VALUES ($1, $2, 'ticket', 'pending', 'Secret boarding', 'secret-pending.pdf',
        'application/pdf', 10, 'pending-storage-token', $3)`,
      [randomUUID(), tripId, owner.id],
    );

    return {
      documentId,
      destinationId: destination.rows[0]?.id ?? "",
      expenseId: expense.rows[0]?.id ?? "",
      itineraryId: itinerary.rows[0]?.id ?? "",
      reservationId,
      tripId,
    };
  }

  async function search(
    identity: Identity | undefined,
    tripId: string,
    query: Record<string, string>,
  ) {
    const pending = request(app.getHttpServer())
      .get(`/api/trips/${tripId}/search`)
      .query(query);
    if (identity) pending.set("Cookie", identity.cookie);
    return pending;
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
      "TRUNCATE TABLE auth_sessions, password_credentials, trip_documents, trip_expense_splits, trip_expenses, reservation_transport_details, trip_reservations, itinerary_items, trip_days, trip_destinations, trip_members, trips, users CASCADE",
    );
    owner = await register("search-owner@example.com");
    editor = await register("search-editor@example.com");
    viewer = await register("search-viewer@example.com");
    outsider = await register("search-outsider@example.com");
  });

  afterAll(async () => {
    await app?.close();
    await pool?.end();
    await container?.stop();
  });

  it("installs indexed generated search vectors that update with source rows", async () => {
    const fixture = await seedFixture();
    const extension = await pool.query<{ installed: boolean }>(
      "SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') AS installed",
    );
    expect(extension.rows[0]?.installed).toBe(true);

    const indexes = await pool.query<{ indexname: string }>(
      "SELECT indexname FROM pg_indexes WHERE indexname LIKE '%search_vector_idx' OR indexname LIKE '%trgm_idx' ORDER BY indexname",
    );
    expect(indexes.rows.map(({ indexname }) => indexname)).toEqual(
      expect.arrayContaining([
        "itinerary_items_search_vector_idx",
        "reservation_transport_search_vector_idx",
        "trip_destinations_name_trgm_idx",
        "trip_documents_file_name_trgm_idx",
        "trip_expenses_search_vector_idx",
        "trip_reservations_title_trgm_idx",
      ]),
    );

    await pool.query("UPDATE trip_destinations SET name = 'Osaka Harbor' WHERE id = $1", [
      fixture.destinationId,
    ]);
    const vector = await pool.query<{ vector: string }>(
      "SELECT search_vector::text AS vector FROM trip_destinations WHERE id = $1",
      [fixture.destinationId],
    );
    expect(vector.rows[0]?.vector).toContain("osaka");
    expect(vector.rows[0]?.vector).not.toContain("kyoto");

    const client = await pool.connect();
    try {
      await client.query("SET enable_seqscan = off");
      const plan = await client.query<{ "QUERY PLAN": string }>(
        "EXPLAIN (ANALYZE, BUFFERS) SELECT id FROM trip_destinations WHERE name % 'Osaka'",
      );
      const text = plan.rows.map((row) => row["QUERY PLAN"]).join("\n");
      expect(text).toMatch(/search_vector_idx|name_trgm_idx/);
    } finally {
      client.release();
    }
  });

  it("searches every allowed source field, typo, and transport details", async () => {
    const fixture = await seedFixture();
    const cases: Array<[string, TripSearchResult["type"]]> = [
      ["Kyoto", "destination"],
      ["Tea ceremony", "itinerary"],
      ["matchnote", "itinerary"],
      ["Gion Hall", "itinerary"],
      ["Hanamikoji", "itinerary"],
      ["Railway West", "reservation"],
      ["Sleeper cabin", "reservation"],
      ["JR42", "reservation"],
      ["Sunrise Rail", "reservation"],
      ["Omakase", "expense"],
      ["voucher-zen.pdf", "document"],
    ];

    for (const [query, type] of cases) {
      const response = await search(owner, fixture.tripId, { q: query });
      expect(response.status, query).toBe(200);
      expect(
        (response.body.results as TripSearchResult[]).some((result) => result.type === type),
        query,
      ).toBe(true);
    }

    const typo = await search(owner, fixture.tripId, { q: "Koyto" });
    expect(typo.body.results).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: fixture.destinationId })]),
    );
    for (const forbidden of [
      "Secret boarding",
      "DO-NOT-SEARCH-992",
      "hidden-storage-token",
      "12000",
    ]) {
      const response = await search(owner, fixture.tripId, { q: forbidden });
      expect(response.status).toBe(200);
      expect(response.body.results).toEqual([]);
    }
  });

  it("ranks exact matches first and keeps filtering, limits, and ordering stable", async () => {
    const fixture = await seedFixture();
    const first = await search(owner, fixture.tripId, { q: "Kyoto" });
    const second = await search(owner, fixture.tripId, { q: "Kyoto" });
    expect(first.body.results[0]).toMatchObject({
      id: fixture.destinationId,
      type: "destination",
    });
    expect(first.body.results.map(({ id }: { id: string }) => id)).toEqual(
      second.body.results.map(({ id }: { id: string }) => id),
    );

    const filtered = await search(owner, fixture.tripId, {
      q: "Rail",
      types: "reservation,reservation",
    });
    expect(filtered.status).toBe(200);
    expect(filtered.body.results.length).toBeGreaterThan(0);
    expect(
      filtered.body.results.every(({ type }: { type: string }) => type === "reservation"),
    ).toBe(true);

    const limited = await search(owner, fixture.tripId, { limit: "1", q: "Rail" });
    expect(limited.body.results).toHaveLength(1);
    expect((await search(owner, fixture.tripId, { limit: "51", q: "Rail" })).status).toBe(400);
    expect((await search(owner, fixture.tripId, { q: "x" })).body.code).toBe(
      "INVALID_SEARCH_QUERY",
    );
    expect((await search(owner, fixture.tripId, { q: "x".repeat(101) })).body.code).toBe(
      "INVALID_SEARCH_QUERY",
    );
    expect((await search(owner, fixture.tripId, { q: "Rail", types: "route" })).status).toBe(400);
  });

  it("enforces authentication, role access, and strict trip isolation", async () => {
    const fixture = await seedFixture();
    const otherTripId = await createTrip(outsider, "Other trip");
    await pool.query(
      "INSERT INTO trip_destinations (trip_id, name, position) VALUES ($1, 'Private Nebula', 0)",
      [otherTripId],
    );

    for (const identity of [owner, editor, viewer]) {
      expect((await search(identity, fixture.tripId, { q: "Kyoto" })).status).toBe(200);
    }
    const denied = await search(outsider, fixture.tripId, { q: "Kyoto" });
    expect(denied.status).toBe(404);
    expect(denied.body.code).toBe("TRIP_NOT_FOUND");
    expect((await search(undefined, fixture.tripId, { q: "Kyoto" })).status).toBe(401);

    const crossTrip = await search(owner, fixture.tripId, { q: "Private Nebula" });
    expect(crossTrip.body.results).toEqual([]);
  });

  it("treats web-search syntax and hostile text as data", async () => {
    const fixture = await seedFixture();
    for (const query of [
      '"Tea ceremony" -missing',
      "Kyoto OR Omakase",
      "'); DROP TABLE trips; --",
      "\\:* & | ! <-> ( )",
    ]) {
      const response = await search(owner, fixture.tripId, { q: query });
      expect(response.status, query).toBe(200);
    }
    const tables = await pool.query<{ count: string }>("SELECT count(*) FROM trips");
    expect(Number(tables.rows[0]?.count)).toBeGreaterThan(0);
  });

  it("keeps modest typos useful and matches representative Unicode names", async () => {
    const fixture = await seedFixture();
    const names = ["Sensoji", "Nozomi", "Tokyo", "São Paulo", "München", "京都", "北京"];
    const inserted = await pool.query<{ id: string; name: string }>(
      `INSERT INTO trip_destinations (trip_id, name, position)
       SELECT $1, value, ordinal::integer
       FROM unnest($2::text[]) WITH ORDINALITY AS names(value, ordinal)
       RETURNING id, name`,
      [fixture.tripId, names],
    );
    const byName = new Map(inserted.rows.map((row) => [row.name, row.id]));

    for (const [query, expected] of [
      ["Sensoi", "Sensoji"],
      ["Nozmi", "Nozomi"],
      ["Tokio", "Tokyo"],
    ] as const) {
      const response = await search(owner, fixture.tripId, { q: query });
      expect(response.status).toBe(200);
      expect(response.body.results).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: byName.get(expected) })]),
      );
    }

    for (const name of ["Tokyo", "São Paulo", "München", "京都", "北京"]) {
      const response = await search(owner, fixture.tripId, { q: name });
      expect(response.status).toBe(200);
      expect(response.body.results).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: byName.get(name) })]),
      );
    }
  });
});
