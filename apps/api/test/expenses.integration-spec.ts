import { resolve } from "node:path";

import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import { type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { CreateTripExpenseRequest } from "@tripforge/contracts";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import request, { type Response } from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { configureApplication } from "../src/common/configure-application";

const PASSWORD = "a sufficiently long password";
const WEB_ORIGIN = "http://127.0.0.1:3000";

type TestIdentity = { cookie: string; id: string };

function mutation(app: INestApplication, method: "delete" | "patch" | "post", path: string) {
  return request(app.getHttpServer())[method](path)
    .set("Origin", WEB_ORIGIN)
    .set("X-TripForge-Request", "1");
}

function sessionCookie(response: Response): string {
  const header = response.headers["set-cookie"] as string | string[] | undefined;
  const value = Array.isArray(header) ? header[0] : header;
  if (!value) throw new Error("Response did not set a session cookie");
  return value.split(";", 1)[0] ?? "";
}

describe("Trip expenses with PostgreSQL", () => {
  let app: INestApplication;
  let container: StartedPostgreSqlContainer;
  let pool: Pool;
  let owner: TestIdentity;
  let editor: TestIdentity;
  let viewer: TestIdentity;
  let outsider: TestIdentity;

  async function register(email: string): Promise<TestIdentity> {
    const response = await mutation(app, "post", "/api/auth/register").send({
      email,
      password: PASSWORD,
    });
    expect(response.status).toBe(201);
    return { cookie: sessionCookie(response), id: response.body.user.id as string };
  }

  async function createTrip(identity: TestIdentity, name = "Japan") {
    return mutation(app, "post", "/api/trips")
      .set("Cookie", identity.cookie)
      .send({ endsOn: "2027-04-20", name, startsOn: "2027-04-10" });
  }

  async function addMember(
    identity: TestIdentity,
    tripId: string,
    email: string,
    role: "editor" | "viewer",
  ) {
    return mutation(app, "post", `/api/trips/${tripId}/members`)
      .set("Cookie", identity.cookie)
      .send({ email, role });
  }

  async function createExpense(
    identity: TestIdentity,
    tripId: string,
    input: Partial<CreateTripExpenseRequest> = {},
  ) {
    return mutation(app, "post", `/api/trips/${tripId}/expenses`)
      .set("Cookie", identity.cookie)
      .send({
        amountMinor: 10_000,
        category: "food",
        currency: "EUR",
        paidByUserId: owner.id,
        spentOn: "2027-04-14",
        split: {
          method: "equal",
          participantUserIds: [owner.id, editor.id, viewer.id],
        },
        title: "Dinner",
        ...input,
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
      "TRUNCATE TABLE auth_sessions, password_credentials, trip_expense_splits, trip_expenses, trip_members, trips, users CASCADE",
    );
    owner = await register("expense-owner@example.com");
    editor = await register("expense-editor@example.com");
    viewer = await register("expense-viewer@example.com");
    outsider = await register("expense-outsider@example.com");
  });

  afterAll(async () => {
    await app?.close();
    await pool?.end();
    await container?.stop();
  });

  it("creates an exact equal expense and applies read/write RBAC", async () => {
    const trip = await createTrip(owner);
    await addMember(owner, trip.body.id, "expense-editor@example.com", "editor");
    await addMember(owner, trip.body.id, "expense-viewer@example.com", "viewer");

    const created = await createExpense(editor, trip.body.id, {
      currency: " eur ",
      paidByUserId: viewer.id,
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      amountMinor: 10_000,
      currency: "EUR",
      paidBy: { userId: viewer.id },
      splitMethod: "equal",
    });
    const shares = created.body.shares as Array<{
      amountMinor: number;
      participant: { userId: string };
    }>;
    expect(shares.reduce((sum, share) => sum + share.amountMinor, 0)).toBe(10_000);
    const sortedIds = [owner.id, editor.id, viewer.id].sort();
    expect(shares).toEqual(
      sortedIds.map((userId, index) => ({
        amountMinor: index === 0 ? 3334 : 3333,
        participant: expect.objectContaining({ userId }),
      })),
    );

    const viewerList = await request(app.getHttpServer())
      .get(`/api/trips/${trip.body.id}/expenses`)
      .set("Cookie", viewer.cookie);
    const viewerMutation = await createExpense(viewer, trip.body.id);
    const outsiderPayer = await createExpense(owner, trip.body.id, {
      paidByUserId: outsider.id,
    });
    const outsiderList = await request(app.getHttpServer())
      .get(`/api/trips/${trip.body.id}/expenses`)
      .set("Cookie", outsider.cookie);
    expect(viewerList.status).toBe(200);
    expect(viewerMutation.status).toBe(403);
    expect(outsiderPayer.status).toBe(404);
    expect(outsiderPayer.body.code).toBe("TRIP_PARTICIPANT_NOT_FOUND");
    expect(outsiderList.status).toBe(404);
    expect(outsiderList.body.code).toBe("TRIP_NOT_FOUND");
  });

  it("rolls back invalid custom splits and enforces update split semantics", async () => {
    const trip = await createTrip(owner);
    await addMember(owner, trip.body.id, "expense-editor@example.com", "editor");
    await addMember(owner, trip.body.id, "expense-viewer@example.com", "viewer");
    const invalid = await createExpense(owner, trip.body.id, {
      split: {
        method: "custom",
        shares: [
          { amountMinor: 4000, userId: owner.id },
          { amountMinor: 5000, userId: editor.id },
        ],
      },
    });
    expect(invalid.status).toBe(400);
    expect(invalid.body.code).toBe("INVALID_EXPENSE_SPLIT");
    expect((await pool.query("SELECT id FROM trip_expenses")).rowCount).toBe(0);

    const custom = await createExpense(owner, trip.body.id, {
      split: {
        method: "custom",
        shares: [
          { amountMinor: 4000, userId: owner.id },
          { amountMinor: 6000, userId: editor.id },
        ],
      },
    });
    expect(custom.status).toBe(201);
    const amountOnly = await mutation(
      app,
      "patch",
      `/api/trips/${trip.body.id}/expenses/${custom.body.id}`,
    )
      .set("Cookie", owner.cookie)
      .send({ amountMinor: 12_000 });
    expect(amountOnly.status).toBe(400);
    expect(amountOnly.body.code).toBe("INVALID_EXPENSE_SPLIT");
    const unchanged = await request(app.getHttpServer())
      .get(`/api/trips/${trip.body.id}/expenses/${custom.body.id}`)
      .set("Cookie", owner.cookie);
    expect(unchanged.body.amountMinor).toBe(10_000);
  });

  it("preserves removed-member payer, shares and balances", async () => {
    const trip = await createTrip(owner);
    await addMember(owner, trip.body.id, "expense-editor@example.com", "editor");
    const created = await createExpense(owner, trip.body.id, {
      paidByUserId: editor.id,
      split: {
        method: "custom",
        shares: [{ amountMinor: 10_000, userId: owner.id }],
      },
    });
    expect(created.status).toBe(201);

    const removed = await mutation(
      app,
      "delete",
      `/api/trips/${trip.body.id}/members/${editor.id}`,
    ).set("Cookie", owner.cookie);
    expect(removed.status).toBe(204);
    const notesOnly = await mutation(
      app,
      "patch",
      `/api/trips/${trip.body.id}/expenses/${created.body.id}`,
    )
      .set("Cookie", owner.cookie)
      .send({ notes: "Preserved history" });
    expect(notesOnly.status).toBe(200);
    expect(notesOnly.body.paidBy.userId).toBe(editor.id);

    const balances = await request(app.getHttpServer())
      .get(`/api/trips/${trip.body.id}/expenses/balances`)
      .set("Cookie", owner.cookie);
    expect(balances.body.currencies[0].balances).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ netMinor: 10_000, participant: expect.objectContaining({ userId: editor.id }) }),
        expect.objectContaining({ netMinor: -10_000, participant: expect.objectContaining({ userId: owner.id }) }),
      ]),
    );
    const formerAccess = await request(app.getHttpServer())
      .get(`/api/trips/${trip.body.id}/expenses`)
      .set("Cookie", editor.cookie);
    expect(formerAccess.status).toBe(404);

    const foreignSplit = await mutation(
      app,
      "patch",
      `/api/trips/${trip.body.id}/expenses/${created.body.id}`,
    )
      .set("Cookie", owner.cookie)
      .send({
        split: {
          method: "custom",
          shares: [{ amountMinor: 10_000, userId: outsider.id }],
        },
      });
    expect(foreignSplit.status).toBe(404);
    expect(foreignSplit.body.code).toBe("TRIP_PARTICIPANT_NOT_FOUND");
  });

  it("keeps linked expenses after reservation deletion and cascades with the trip", async () => {
    const trip = await createTrip(owner);
    await addMember(owner, trip.body.id, "expense-editor@example.com", "editor");
    await addMember(owner, trip.body.id, "expense-viewer@example.com", "viewer");
    const reservation = await mutation(
      app,
      "post",
      `/api/trips/${trip.body.id}/reservations`,
    )
      .set("Cookie", owner.cookie)
      .send({
        kind: "accommodation",
        startDate: "2027-04-12",
        status: "confirmed",
        title: "Hotel",
      });
    const expense = await createExpense(owner, trip.body.id, {
      reservationId: reservation.body.id,
    });
    expect(expense.status).toBe(201);

    await mutation(
      app,
      "delete",
      `/api/trips/${trip.body.id}/reservations/${reservation.body.id}`,
    ).set("Cookie", owner.cookie);
    const preserved = await request(app.getHttpServer())
      .get(`/api/trips/${trip.body.id}/expenses/${expense.body.id}`)
      .set("Cookie", owner.cookie);
    expect(preserved.body.reservationId).toBeNull();

    const deleted = await mutation(app, "delete", `/api/trips/${trip.body.id}`).set(
      "Cookie",
      owner.cookie,
    );
    expect(deleted.status).toBe(204);
    expect((await pool.query("SELECT id FROM trip_expenses")).rowCount).toBe(0);
    expect((await pool.query("SELECT expense_id FROM trip_expense_splits")).rowCount).toBe(0);
  });

  it("derives independent exact multi-currency balances and rejects DB-invalid rows", async () => {
    const trip = await createTrip(owner);
    await addMember(owner, trip.body.id, "expense-editor@example.com", "editor");
    await addMember(owner, trip.body.id, "expense-viewer@example.com", "viewer");
    const euroExpense = await createExpense(owner, trip.body.id, {
      amountMinor: 9000,
      split: {
        method: "custom",
        shares: [
          { amountMinor: 4500, userId: owner.id },
          { amountMinor: 4500, userId: editor.id },
        ],
      },
    });
    await createExpense(owner, trip.body.id, {
      amountMinor: 1200,
      currency: "JPY",
      paidByUserId: editor.id,
      split: {
        method: "custom",
        shares: [{ amountMinor: 1200, userId: viewer.id }],
      },
    });
    const balances = await request(app.getHttpServer())
      .get(`/api/trips/${trip.body.id}/expenses/balances`)
      .set("Cookie", viewer.cookie);
    expect(balances.status).toBe(200);
    expect(balances.body.currencies.map(({ currency }: { currency: string }) => currency)).toEqual([
      "EUR",
      "JPY",
    ]);
    for (const group of balances.body.currencies as Array<{
      balances: Array<{ netMinor: number }>;
    }>) {
      expect(group.balances.reduce((sum, item) => sum + item.netMinor, 0)).toBe(0);
    }

    await expect(
      pool.query(
        `INSERT INTO trip_expenses
          (trip_id, title, category, spent_on, currency, amount_minor, paid_by_user_id, split_method)
         VALUES ($1, 'Bad', 'food', '2027-04-14', 'eur', 1, $2, 'equal')`,
        [trip.body.id, owner.id],
      ),
    ).rejects.toThrow();
    await expect(
      pool.query(
        `INSERT INTO trip_expenses
          (trip_id, title, category, spent_on, currency, amount_minor, paid_by_user_id, split_method)
         VALUES ($1, 'Bad', 'food', '2027-04-14', 'EUR', 0, $2, 'equal')`,
        [trip.body.id, owner.id],
      ),
    ).rejects.toThrow();
    await expect(
      pool.query(
        `INSERT INTO trip_expenses
          (trip_id, title, category, spent_on, currency, amount_minor, paid_by_user_id, split_method)
         VALUES ($1, 'Bad', 'food', '2027-04-14', 'EUR', 9007199254740992, $2, 'equal')`,
        [trip.body.id, owner.id],
      ),
    ).rejects.toThrow();
    await expect(
      pool.query(
        `INSERT INTO trip_expenses
          (trip_id, title, category, spent_on, currency, amount_minor, paid_by_user_id, split_method)
         VALUES ($1, '   ', 'food', '2027-04-14', 'EUR', 1, $2, 'equal')`,
        [trip.body.id, owner.id],
      ),
    ).rejects.toThrow();
    await expect(
      pool.query(
        `INSERT INTO trip_expenses
          (trip_id, title, category, spent_on, currency, amount_minor, paid_by_user_id, split_method)
         VALUES ($1, 'Bad', 'invalid', '2027-04-14', 'EUR', 1, $2, 'equal')`,
        [trip.body.id, owner.id],
      ),
    ).rejects.toThrow();
    await expect(
      pool.query(
        `INSERT INTO trip_expenses
          (trip_id, title, category, spent_on, currency, amount_minor, paid_by_user_id, split_method)
         VALUES ('00000000-0000-4000-8000-000000000001', 'Bad', 'food', '2027-04-14', 'EUR', 1, $1, 'equal')`,
        [owner.id],
      ),
    ).rejects.toThrow();
    await expect(
      pool.query(
        `INSERT INTO trip_expenses
          (trip_id, title, category, spent_on, currency, amount_minor, paid_by_user_id, split_method)
         VALUES ($1, 'Bad', 'food', '2027-04-14', 'EUR', 1, '00000000-0000-4000-8000-000000000002', 'equal')`,
        [trip.body.id],
      ),
    ).rejects.toThrow();

    await expect(
      pool.query(
        `INSERT INTO trip_expense_splits (expense_id, user_id, amount_minor)
         VALUES ($1, $2, 0)`,
        [euroExpense.body.id, owner.id],
      ),
    ).rejects.toThrow();
    await expect(
      pool.query(
        `INSERT INTO trip_expense_splits (expense_id, user_id, amount_minor)
         VALUES ($1, '00000000-0000-4000-8000-000000000003', 0)`,
        [euroExpense.body.id],
      ),
    ).rejects.toThrow();
  });
});
