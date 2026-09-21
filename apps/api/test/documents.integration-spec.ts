import { resolve } from "node:path";

import {
  CreateBucketCommand,
  GetPublicAccessBlockCommand,
  HeadObjectCommand,
  PutPublicAccessBlockCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { LocalstackContainer, type StartedLocalStackContainer } from "@testcontainers/localstack";
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

const BUCKET = "tripforge-documents";
const LOCALSTACK_TEST_IMAGE =
  process.env.LOCALSTACK_TEST_IMAGE ?? "localstack/localstack:4.14.0";
const PASSWORD = "a sufficiently long password";
const WEB_ORIGIN = "http://127.0.0.1:3000";
const credentials = { accessKeyId: "test", secretAccessKey: "test" };

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

describe("Trip documents with PostgreSQL and LocalStack S3", () => {
  let app: INestApplication;
  let database: StartedPostgreSqlContainer;
  let localstack: StartedLocalStackContainer;
  let pool: Pool;
  let s3: S3Client;
  let owner: TestIdentity;
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

  async function createTrip(identity: TestIdentity) {
    return mutation(app, "post", "/api/trips")
      .set("Cookie", identity.cookie)
      .send({ endsOn: "2027-04-20", name: "Documents", startsOn: "2027-04-10" });
  }

  async function createUpload(
    identity: TestIdentity,
    tripId: string,
    overrides: Record<string, unknown> = {},
  ) {
    return mutation(app, "post", `/api/trips/${tripId}/documents/uploads`)
      .set("Cookie", identity.cookie)
      .send({
        contentType: "application/pdf",
        fileName: "../../ticket.pdf",
        kind: "ticket",
        sizeBytes: 9,
        title: "Flight ticket",
        ...overrides,
      });
  }

  beforeAll(async () => {
    [database, localstack] = await Promise.all([
      new PostgreSqlContainer("postgres:18.6-bookworm")
        .withDatabase("tripforge")
        .withUsername("tripforge")
        .withPassword("tripforge")
        .start(),
      new LocalstackContainer(LOCALSTACK_TEST_IMAGE)
        .withEnvironment({
          ...(process.env.LOCALSTACK_AUTH_TOKEN
            ? { LOCALSTACK_AUTH_TOKEN: process.env.LOCALSTACK_AUTH_TOKEN }
            : {}),
          S3_SKIP_SIGNATURE_VALIDATION: "0",
          SERVICES: "s3",
        })
        .start(),
    ]);
    const databaseUrl = database.getConnectionUri();
    const s3Endpoint = localstack.getConnectionUri();
    const migrationPool = new Pool({ connectionString: databaseUrl });
    await migrate(drizzle(migrationPool), {
      migrationsFolder: resolve(process.cwd(), "drizzle"),
    });
    await migrationPool.end();

    s3 = new S3Client({
      credentials,
      endpoint: s3Endpoint,
      forcePathStyle: true,
      region: "us-east-1",
    });
    await s3.send(new CreateBucketCommand({ Bucket: BUCKET }));
    await s3.send(
      new PutPublicAccessBlockCommand({
        Bucket: BUCKET,
        PublicAccessBlockConfiguration: {
          BlockPublicAcls: true,
          BlockPublicPolicy: true,
          IgnorePublicAcls: true,
          RestrictPublicBuckets: true,
        },
      }),
    );

    process.env.AWS_ACCESS_KEY_ID = credentials.accessKeyId;
    process.env.AWS_SECRET_ACCESS_KEY = credentials.secretAccessKey;
    process.env.DATABASE_URL = databaseUrl;
    process.env.NODE_ENV = "test";
    process.env.S3_BUCKET = BUCKET;
    process.env.S3_ENDPOINT = s3Endpoint;
    process.env.S3_FORCE_PATH_STYLE = "true";
    process.env.S3_PUBLIC_ENDPOINT = s3Endpoint;
    process.env.S3_REGION = "us-east-1";
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
      "TRUNCATE TABLE auth_sessions, password_credentials, trip_documents, trip_expense_splits, trip_expenses, trip_members, trips, users CASCADE",
    );
    owner = await register("document-owner@example.com");
    viewer = await register("document-viewer@example.com");
    outsider = await register("document-outsider@example.com");
  });

  afterAll(async () => {
    await app?.close();
    await pool?.end();
    s3?.destroy();
    await database?.stop();
    await localstack?.stop();
  });

  it("uploads, verifies, downloads identical bytes and deletes metadata plus object", async () => {
    const trip = await createTrip(owner);
    const bytes = Buffer.from("pdf bytes");
    const intent = await createUpload(owner, trip.body.id);
    expect(intent.status).toBe(201);
    expect(intent.body.document).toMatchObject({
      fileName: "ticket.pdf",
      status: "pending",
    });
    expect(intent.body.upload.url).not.toContain("localstack:4566");

    const beforeComplete = await request(app.getHttpServer())
      .get(`/api/trips/${trip.body.id}/documents`)
      .set("Cookie", owner.cookie);
    expect(beforeComplete.body).toEqual([]);

    const upload = await fetch(intent.body.upload.url, {
      body: bytes,
      headers: intent.body.upload.headers,
      method: "PUT",
    });
    expect(upload.ok).toBe(true);
    const completePath = `/api/trips/${trip.body.id}/documents/${intent.body.document.id}/complete`;
    const completed = await mutation(app, "post", completePath)
      .set("Cookie", owner.cookie)
      .send({});
    expect(completed.status).toBe(201);
    expect(completed.body.status).toBe("ready");
    const repeated = await mutation(app, "post", completePath)
      .set("Cookie", owner.cookie)
      .send({});
    expect(repeated.body).toEqual(completed.body);

    const download = await request(app.getHttpServer())
      .get(`/api/trips/${trip.body.id}/documents/${completed.body.id}/download`)
      .set("Cookie", owner.cookie);
    expect(download.status).toBe(200);
    const downloaded = Buffer.from(await (await fetch(download.body.url)).arrayBuffer());
    expect(downloaded).toEqual(bytes);

    const keyResult = await pool.query<{ storage_key: string }>(
      "SELECT storage_key FROM trip_documents WHERE id = $1",
      [completed.body.id],
    );
    const storageKey = keyResult.rows[0]?.storage_key;
    expect(storageKey).not.toContain("ticket.pdf");
    const publicAccess = await s3.send(new GetPublicAccessBlockCommand({ Bucket: BUCKET }));
    expect(publicAccess.PublicAccessBlockConfiguration).toMatchObject({
      BlockPublicAcls: true,
      BlockPublicPolicy: true,
      IgnorePublicAcls: true,
      RestrictPublicBuckets: true,
    });
    const tamperedUrl = new URL(download.body.url);
    tamperedUrl.searchParams.set("X-Amz-Signature", "0".repeat(64));
    expect((await fetch(tamperedUrl)).status).toBe(403);

    const deleted = await mutation(
      app,
      "delete",
      `/api/trips/${trip.body.id}/documents/${completed.body.id}`,
    ).set("Cookie", owner.cookie);
    expect(deleted.status).toBe(204);
    await expect(
      s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: storageKey })),
    ).rejects.toBeDefined();
  });

  it("keeps incomplete and mismatched uploads pending", async () => {
    const trip = await createTrip(owner);
    const missing = await createUpload(owner, trip.body.id);
    const missingComplete = await mutation(
      app,
      "post",
      `/api/trips/${trip.body.id}/documents/${missing.body.document.id}/complete`,
    )
      .set("Cookie", owner.cookie)
      .send({});
    expect(missingComplete.status).toBe(409);
    expect(missingComplete.body.code).toBe("DOCUMENT_UPLOAD_NOT_FOUND");

    const mismatch = await createUpload(owner, trip.body.id, { sizeBytes: 1000 });
    await fetch(mismatch.body.upload.url, {
      body: Buffer.from("short"),
      headers: mismatch.body.upload.headers,
      method: "PUT",
    });
    const mismatchComplete = await mutation(
      app,
      "post",
      `/api/trips/${trip.body.id}/documents/${mismatch.body.document.id}/complete`,
    )
      .set("Cookie", owner.cookie)
      .send({});
    expect(mismatchComplete.status).toBe(409);
    expect(mismatchComplete.body.code).toBe("DOCUMENT_UPLOAD_MISMATCH");
    expect(
      (await pool.query("SELECT status FROM trip_documents WHERE id = $1", [mismatch.body.document.id])).rows[0]?.status,
    ).toBe("pending");
  });

  it("enforces upload RBAC and Trip-scoped links", async () => {
    const trip = await createTrip(owner);
    await mutation(app, "post", `/api/trips/${trip.body.id}/members`)
      .set("Cookie", owner.cookie)
      .send({ email: "document-viewer@example.com", role: "viewer" });
    const viewerUpload = await createUpload(viewer, trip.body.id);
    expect(viewerUpload.status).toBe(403);
    const outsiderUpload = await createUpload(outsider, trip.body.id);
    expect(outsiderUpload.status).toBe(404);

    const foreignTrip = await createTrip(outsider);
    const expense = await mutation(app, "post", `/api/trips/${foreignTrip.body.id}/expenses`)
      .set("Cookie", outsider.cookie)
      .send({
        amountMinor: 100,
        category: "other",
        currency: "EUR",
        paidByUserId: outsider.id,
        spentOn: "2027-04-14",
        split: { method: "equal", participantUserIds: [outsider.id] },
        title: "Foreign expense",
      });
    const linked = await createUpload(owner, trip.body.id, {
      link: { id: expense.body.id, type: "expense" },
    });
    expect(linked.status).toBe(404);
    expect(linked.body.code).toBe("EXPENSE_NOT_FOUND");
  });

  it("keeps documents while itinerary, reservation and expense links become null", async () => {
    const trip = await createTrip(owner);
    const days = await request(app.getHttpServer())
      .get(`/api/trips/${trip.body.id}/days`)
      .set("Cookie", owner.cookie);
    const itinerary = await mutation(
      app,
      "post",
      `/api/trips/${trip.body.id}/itinerary-items`,
    )
      .set("Cookie", owner.cookie)
      .send({ dayId: days.body[0].id, kind: "activity", title: "Museum" });
    const reservation = await mutation(
      app,
      "post",
      `/api/trips/${trip.body.id}/reservations`,
    )
      .set("Cookie", owner.cookie)
      .send({
        kind: "activity",
        startDate: "2027-04-12",
        status: "confirmed",
        title: "Museum booking",
      });
    const expense = await mutation(app, "post", `/api/trips/${trip.body.id}/expenses`)
      .set("Cookie", owner.cookie)
      .send({
        amountMinor: 100,
        category: "activity",
        currency: "EUR",
        paidByUserId: owner.id,
        spentOn: "2027-04-12",
        split: { method: "equal", participantUserIds: [owner.id] },
        title: "Museum",
      });

    const linkedDocuments = await Promise.all([
      createUpload(owner, trip.body.id, {
        link: { id: itinerary.body.id, type: "itinerary" },
      }),
      createUpload(owner, trip.body.id, {
        link: { id: reservation.body.id, type: "reservation" },
      }),
      createUpload(owner, trip.body.id, {
        link: { id: expense.body.id, type: "expense" },
      }),
    ]);
    expect(linkedDocuments.every(({ status }) => status === 201)).toBe(true);

    await expect(
      pool.query(
        `UPDATE trip_documents
         SET reservation_id = $1, expense_id = $2
         WHERE id = $3`,
        [reservation.body.id, expense.body.id, linkedDocuments[0]?.body.document.id],
      ),
    ).rejects.toThrow();

    await mutation(
      app,
      "delete",
      `/api/trips/${trip.body.id}/itinerary-items/${itinerary.body.id}`,
    ).set("Cookie", owner.cookie);
    await mutation(
      app,
      "delete",
      `/api/trips/${trip.body.id}/reservations/${reservation.body.id}`,
    ).set("Cookie", owner.cookie);
    await mutation(
      app,
      "delete",
      `/api/trips/${trip.body.id}/expenses/${expense.body.id}`,
    ).set("Cookie", owner.cookie);

    const rows = await pool.query<{
      expense_id: string | null;
      itinerary_item_id: string | null;
      reservation_id: string | null;
    }>(
      `SELECT expense_id, itinerary_item_id, reservation_id
       FROM trip_documents WHERE trip_id = $1`,
      [trip.body.id],
    );
    expect(rows.rows).toHaveLength(3);
    expect(rows.rows.every((row) =>
      row.expense_id === null &&
      row.itinerary_item_id === null &&
      row.reservation_id === null,
    )).toBe(true);
  });

  it("preserves historical uploader metadata after member removal", async () => {
    const trip = await createTrip(owner);
    await mutation(app, "post", `/api/trips/${trip.body.id}/members`)
      .set("Cookie", owner.cookie)
      .send({ email: "document-viewer@example.com", role: "editor" });
    const intent = await createUpload(viewer, trip.body.id);
    await fetch(intent.body.upload.url, {
      body: Buffer.from("pdf bytes"),
      headers: intent.body.upload.headers,
      method: "PUT",
    });
    await mutation(
      app,
      "post",
      `/api/trips/${trip.body.id}/documents/${intent.body.document.id}/complete`,
    )
      .set("Cookie", viewer.cookie)
      .send({});

    await mutation(
      app,
      "delete",
      `/api/trips/${trip.body.id}/members/${viewer.id}`,
    ).set("Cookie", owner.cookie);
    const list = await request(app.getHttpServer())
      .get(`/api/trips/${trip.body.id}/documents`)
      .set("Cookie", owner.cookie);
    expect(list.body[0].uploadedBy.userId).toBe(viewer.id);
    const formerAccess = await request(app.getHttpServer())
      .get(`/api/trips/${trip.body.id}/documents`)
      .set("Cookie", viewer.cookie);
    expect(formerAccess.status).toBe(404);
  });

  it("enforces document row constraints and Trip cascade directly in PostgreSQL", async () => {
    const trip = await createTrip(owner);
    const baseSql = `INSERT INTO trip_documents
      (id, trip_id, kind, status, title, original_file_name, content_type,
       size_bytes, storage_key, uploaded_by_user_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`;
    const valid = [
      "10000000-0000-4000-8000-000000000001",
      trip.body.id,
      "ticket",
      "pending",
      "Ticket",
      "ticket.pdf",
      "application/pdf",
      1,
      "opaque-one",
      owner.id,
    ];
    await pool.query(baseSql, valid);
    for (const [index, value] of [
      [2, "invalid-kind"],
      [3, "invalid-status"],
      [6, "text/html"],
      [7, 0],
      [7, 25 * 1024 * 1024 + 1],
    ] as Array<[number, string | number]>) {
      const values = [...valid];
      values[0] = `20000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
      values[8] = `opaque-${index}-${value}`;
      values[index] = value;
      await expect(pool.query(baseSql, values)).rejects.toThrow();
    }

    const duplicate = [...valid];
    duplicate[0] = "30000000-0000-4000-8000-000000000001";
    await expect(pool.query(baseSql, duplicate)).rejects.toThrow();
    const foreignTrip = [...valid];
    foreignTrip[0] = "30000000-0000-4000-8000-000000000002";
    foreignTrip[1] = "00000000-0000-4000-8000-000000000099";
    foreignTrip[8] = "opaque-foreign-trip";
    await expect(pool.query(baseSql, foreignTrip)).rejects.toThrow();
    const foreignUser = [...valid];
    foreignUser[0] = "30000000-0000-4000-8000-000000000003";
    foreignUser[8] = "opaque-foreign-user";
    foreignUser[9] = "00000000-0000-4000-8000-000000000098";
    await expect(pool.query(baseSql, foreignUser)).rejects.toThrow();

    await mutation(app, "delete", `/api/trips/${trip.body.id}`).set(
      "Cookie",
      owner.cookie,
    );
    expect((await pool.query("SELECT id FROM trip_documents")).rowCount).toBe(0);
  });
});
