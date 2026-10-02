import { randomUUID } from "node:crypto";
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
import { RedisContainer, type StartedRedisContainer } from "@testcontainers/redis";
import { Queue, QueueEvents, Worker } from "bullmq";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import Redis from "ioredis";
import { Pool } from "pg";
import request, { type Response } from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { configureApplication } from "../src/common/configure-application";
import { JOB_NAMES } from "../src/background-jobs/background-jobs.constants";
import { CleanupOutboxDispatcher } from "../src/background-jobs/cleanup-outbox-dispatcher.service";
import { cleanupJobId } from "../src/background-jobs/cleanup-outbox-dispatcher.service";
import { StorageCleanupOutboxRepository } from "../src/background-jobs/storage-cleanup-outbox.repository";
import { StorageCleanupProcessor } from "../src/background-jobs/storage-cleanup.processor";
import { DATABASE } from "../src/database/database.constants";
import type { Database } from "../src/database/database.provider";
import { S3StorageService } from "../src/storage/s3-storage.service";
import { TripDocumentsRepository } from "../src/trips/trip-documents.repository";

const BUCKET = "tripforge-documents";
const LOCALSTACK_TEST_IMAGE =
  process.env.LOCALSTACK_TEST_IMAGE ?? "localstack/localstack:4.14.0";
const REDIS_IMAGE = "redis:8.10.1-alpine";
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
  let redis: StartedRedisContainer;
  let pool: Pool;
  let s3: S3Client;
  let cleanupProcessor: StorageCleanupProcessor;
  let dispatcher: CleanupOutboxDispatcher;
  let documentsRepository: TripDocumentsRepository;
  let outboxRepository: StorageCleanupOutboxRepository;
  let storage: S3StorageService;
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

  async function createReadyDocument(identity: TestIdentity, tripId: string) {
    const bytes = Buffer.from("pdf bytes");
    const intent = await createUpload(identity, tripId);
    expect(intent.status).toBe(201);
    const uploaded = await fetch(intent.body.upload.url, {
      body: bytes,
      headers: intent.body.upload.headers,
      method: "PUT",
    });
    expect(uploaded.ok).toBe(true);
    const completed = await mutation(
      app,
      "post",
      `/api/trips/${tripId}/documents/${intent.body.document.id}/complete`,
    )
      .set("Cookie", identity.cookie)
      .send({});
    expect(completed.status).toBe(201);
    const key = await pool.query<{ storage_key: string }>(
      "SELECT storage_key FROM trip_documents WHERE id = $1",
      [completed.body.id],
    );
    return {
      documentId: completed.body.id as string,
      storageKey: key.rows[0]?.storage_key as string,
    };
  }

  async function processIncompleteOutbox(
    processor: StorageCleanupProcessor = cleanupProcessor,
    options: { attempts?: number; backoffDelay?: number; dispatch?: boolean } = {},
  ): Promise<number> {
    const name = `tripforge-maintenance-documents-${randomUUID()}`;
    const queueConnection = redisConnection(1);
    const eventConnection = redisConnection(null);
    const workerConnection = redisConnection(null);
    const queue = new Queue(name, { connection: queueConnection });
    const events = new QueueEvents(name, { connection: eventConnection });
    const worker = new Worker(name, (job) => processor.process(job), {
      connection: workerConnection,
      concurrency: 2,
    });
    try {
      await Promise.all([events.waitUntilReady(), worker.waitUntilReady()]);
      const pending = await pool.query<{ id: string }>(
        "SELECT id FROM storage_cleanup_outbox WHERE completed_at IS NULL AND failed_at IS NULL ORDER BY created_at, id",
      );
      if (options.dispatch === false) {
        for (const { id } of pending.rows) {
          await queue.add(
            JOB_NAMES.cleanupObject,
            { outboxId: id },
            {
              attempts: options.attempts ?? 3,
              backoff: { delay: options.backoffDelay ?? 20, type: "exponential" },
              jobId: cleanupJobId(id),
            },
          );
        }
      } else {
        await dispatcher.dispatch(queue);
      }
      for (const { id } of pending.rows) {
        const job = await queue.getJob(cleanupJobId(id));
        expect(job).toBeDefined();
        await job?.waitUntilFinished(events, 10_000);
      }
      return pending.rows.length;
    } finally {
      await worker.close();
      await events.close();
      await queue.close();
      await closeRedis(workerConnection, eventConnection, queueConnection);
    }
  }

  function redisConnection(maxRetriesPerRequest: number | null): Redis {
    return new Redis(redis.getConnectionUrl(), { maxRetriesPerRequest });
  }

  async function waitForDatabaseLock(): Promise<void> {
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline) {
      const result = await pool.query<{ waiting: boolean }>(
        `SELECT EXISTS (
           SELECT 1 FROM pg_stat_activity
           WHERE datname = current_database()
             AND pid <> pg_backend_pid()
             AND wait_event_type = 'Lock'
         ) AS waiting`,
      );
      if (result.rows[0]?.waiting) return;
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 10));
    }
    throw new Error("Expected a PostgreSQL lock waiter");
  }

  beforeAll(async () => {
    [database, localstack, redis] = await Promise.all([
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
      new RedisContainer(REDIS_IMAGE)
        .withCommand([
          "redis-server",
          "--appendonly",
          "yes",
          "--appendfsync",
          "everysec",
        ])
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
    await app.listen(0, "127.0.0.1");
    documentsRepository = app.get(TripDocumentsRepository);
    const applicationDatabase = app.get<Database>(DATABASE);
    storage = app.get(S3StorageService);
    outboxRepository = new StorageCleanupOutboxRepository(applicationDatabase);
    cleanupProcessor = new StorageCleanupProcessor(outboxRepository, storage);
    dispatcher = new CleanupOutboxDispatcher(outboxRepository);
    pool = new Pool({ connectionString: databaseUrl });
  });

  beforeEach(async () => {
    await pool.query(
      "TRUNCATE TABLE auth_sessions, password_credentials, storage_cleanup_outbox, trip_documents, trip_expense_splits, trip_expenses, trip_members, trips, users CASCADE",
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
    await redis?.stop();
  });

  it("uploads, verifies and records durable asynchronous cleanup on delete", async () => {
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
    const deletedDownload = await request(app.getHttpServer())
      .get(`/api/trips/${trip.body.id}/documents/${completed.body.id}/download`)
      .set("Cookie", owner.cookie);
    expect(deletedDownload.status).toBe(404);
    expect(
      (
        await pool.query(
          "SELECT storage_key, reason, completed_at FROM storage_cleanup_outbox",
        )
      ).rows,
    ).toEqual([
      {
        completed_at: null,
        reason: "document_delete",
        storage_key: storageKey,
      },
    ]);
    await expect(
      s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: storageKey })),
    ).resolves.toBeDefined();
  });

  it("dispatches a document outbox through Redis and deletes S3 asynchronously", async () => {
    const trip = await createTrip(owner);
    const document = await createReadyDocument(owner, trip.body.id);

    const deleted = await mutation(
      app,
      "delete",
      `/api/trips/${trip.body.id}/documents/${document.documentId}`,
    ).set("Cookie", owner.cookie);
    expect(deleted.status).toBe(204);
    await expect(
      s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: document.storageKey })),
    ).resolves.toBeDefined();

    await expect(processIncompleteOutbox()).resolves.toBe(1);
    await expect(
      s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: document.storageKey })),
    ).rejects.toThrow();
    const outbox = await pool.query<{ completed_at: Date | null }>(
      "SELECT completed_at FROM storage_cleanup_outbox WHERE storage_key = $1",
      [document.storageKey],
    );
    expect(outbox.rows[0]?.completed_at).toBeInstanceOf(Date);
  });

  it("retries a transient storage failure and eventually completes cleanup", async () => {
    const trip = await createTrip(owner);
    const document = await createReadyDocument(owner, trip.body.id);
    await mutation(
      app,
      "delete",
      `/api/trips/${trip.body.id}/documents/${document.documentId}`,
    ).set("Cookie", owner.cookie);

    let deleteAttempts = 0;
    const flakyStorage = {
      deleteObject: async (storageKey: string) => {
        deleteAttempts += 1;
        if (deleteAttempts < 3) throw new Error("S3 temporarily unavailable");
        await storage.deleteObject(storageKey);
      },
    } as unknown as S3StorageService;
    const flakyProcessor = new StorageCleanupProcessor(
      outboxRepository,
      flakyStorage,
    );

    await expect(
      processIncompleteOutbox(flakyProcessor, {
        attempts: 3,
        backoffDelay: 20,
        dispatch: false,
      }),
    ).resolves.toBe(1);
    expect(deleteAttempts).toBe(3);
    await expect(
      s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: document.storageKey })),
    ).rejects.toThrow();
    expect(
      (
        await pool.query(
          "SELECT completed_at FROM storage_cleanup_outbox WHERE storage_key = $1",
          [document.storageKey],
        )
      ).rows[0]?.completed_at,
    ).toBeInstanceOf(Date);
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

  it("cleans only stale pending rows into a bounded durable outbox", async () => {
    const trip = await createTrip(owner);
    const oldPending = await createUpload(owner, trip.body.id, {
      title: "Old pending",
    });
    const recentPending = await createUpload(owner, trip.body.id, {
      title: "Recent pending",
    });
    const oldReady = await createUpload(owner, trip.body.id, {
      title: "Old ready",
    });
    await fetch(oldReady.body.upload.url, {
      body: Buffer.from("pdf bytes"),
      headers: oldReady.body.upload.headers,
      method: "PUT",
    });
    await mutation(
      app,
      "post",
      `/api/trips/${trip.body.id}/documents/${oldReady.body.document.id}/complete`,
    )
      .set("Cookie", owner.cookie)
      .send({});
    await pool.query(
      `UPDATE trip_documents
       SET created_at = CASE WHEN id = $1 OR id = $2
         THEN '2027-01-01T00:00:00Z'::timestamptz
         ELSE '2027-01-01T02:00:00Z'::timestamptz END`,
      [oldPending.body.document.id, oldReady.body.document.id],
    );
    const oldPendingKey = (
      await pool.query<{ storage_key: string }>(
        "SELECT storage_key FROM trip_documents WHERE id = $1",
        [oldPending.body.document.id],
      )
    ).rows[0]?.storage_key;

    await expect(
      documentsRepository.cleanupStalePending(
        new Date("2027-01-01T01:00:00.000Z"),
        100,
      ),
    ).resolves.toBe(1);
    const remaining = await pool.query<{ id: string; status: string }>(
      "SELECT id, status FROM trip_documents ORDER BY title",
    );
    expect(remaining.rows).toEqual(
      expect.arrayContaining([
        { id: oldReady.body.document.id, status: "ready" },
        { id: recentPending.body.document.id, status: "pending" },
      ]),
    );
    expect(remaining.rows).toHaveLength(2);
    expect(
      (
        await pool.query(
          "SELECT reason, storage_key FROM storage_cleanup_outbox",
        )
      ).rows,
    ).toEqual([
      {
        reason: "stale_pending",
        storage_key: oldPendingKey,
      },
    ]);
  });

  it("cleans stale pending uploads with and without an S3 object", async () => {
    const trip = await createTrip(owner);
    const withObject = await createUpload(owner, trip.body.id, {
      title: "Abandoned after PUT",
    });
    const withoutObject = await createUpload(owner, trip.body.id, {
      title: "Abandoned before PUT",
    });
    expect(withoutObject.status).toBe(201);
    await fetch(withObject.body.upload.url, {
      body: Buffer.from("pdf bytes"),
      headers: withObject.body.upload.headers,
      method: "PUT",
    });
    await pool.query(
      "UPDATE trip_documents SET created_at = '2027-01-01T00:00:00Z'::timestamptz",
    );
    const keys = await pool.query<{ storage_key: string }>(
      "SELECT storage_key FROM trip_documents ORDER BY storage_key",
    );

    await expect(
      documentsRepository.cleanupStalePending(
        new Date("2027-01-01T01:00:00.000Z"),
        100,
      ),
    ).resolves.toBe(2);
    await expect(processIncompleteOutbox()).resolves.toBe(2);
    expect((await pool.query("SELECT id FROM trip_documents")).rowCount).toBe(0);
    expect(
      (
        await pool.query(
          "SELECT id FROM storage_cleanup_outbox WHERE completed_at IS NOT NULL",
        )
      ).rowCount,
    ).toBe(2);
    for (const { storage_key: storageKey } of keys.rows) {
      await expect(
        s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: storageKey })),
      ).rejects.toThrow();
    }
  });

  it("reconstructs cleanup jobs from PostgreSQL after Redis data loss", async () => {
    const trip = await createTrip(owner);
    const document = await createReadyDocument(owner, trip.body.id);
    await mutation(
      app,
      "delete",
      `/api/trips/${trip.body.id}/documents/${document.documentId}`,
    ).set("Cookie", owner.cookie);
    const outbox = await pool.query<{ id: string }>(
      "SELECT id FROM storage_cleanup_outbox WHERE storage_key = $1",
      [document.storageKey],
    );
    const outboxId = outbox.rows[0]?.id as string;
    const name = `tripforge-maintenance-loss-${randomUUID()}`;
    const queueConnection = redisConnection(1);
    const queue = new Queue(name, { connection: queueConnection });
    let workerConnection: Redis | undefined;
    let eventConnection: Redis | undefined;
    let worker: Worker | undefined;
    let events: QueueEvents | undefined;
    try {
      await dispatcher.dispatch(queue);
      expect(await queue.getJob(cleanupJobId(outboxId))).toBeDefined();
      const admin = redisConnection(1);
      await admin.flushdb();
      await admin.quit();
      expect(await queue.getJob(cleanupJobId(outboxId))).toBeUndefined();

      await dispatcher.dispatch(queue);
      const restored = await queue.getJob(cleanupJobId(outboxId));
      expect(restored).toBeDefined();
      eventConnection = redisConnection(null);
      workerConnection = redisConnection(null);
      events = new QueueEvents(name, { connection: eventConnection });
      worker = new Worker(name, (job) => cleanupProcessor.process(job), {
        connection: workerConnection,
      });
      await Promise.all([events.waitUntilReady(), worker.waitUntilReady()]);
      await restored?.waitUntilFinished(events, 10_000);
      expect(
        (
          await pool.query(
            "SELECT completed_at FROM storage_cleanup_outbox WHERE id = $1",
            [outboxId],
          )
        ).rows[0]?.completed_at,
      ).toBeInstanceOf(Date);
    } finally {
      await worker?.close();
      await events?.close();
      await queue.close();
      await closeRedis(workerConnection, eventConnection, queueConnection);
    }
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

  it("serializes upload initialization against Trip deletion", async () => {
    const trip = await createTrip(owner);
    const lockClient = await pool.connect();
    await lockClient.query("BEGIN");
    await lockClient.query("SELECT id FROM trips WHERE id = $1 FOR UPDATE", [
      trip.body.id,
    ]);
    const upload = createUpload(owner, trip.body.id);
    try {
      await waitForDatabaseLock();
      await lockClient.query("DELETE FROM trips WHERE id = $1", [trip.body.id]);
      await lockClient.query("COMMIT");
      const response = await upload;
      expect(response.status).toBe(404);
      expect(response.body.code).toBe("TRIP_NOT_FOUND");
      expect((await pool.query("SELECT id FROM trip_documents")).rowCount).toBe(0);
    } finally {
      await lockClient.query("ROLLBACK").catch(() => undefined);
      lockClient.release();
    }
  });

  it("serializes completion against stale cleanup without contradictory state", async () => {
    const trip = await createTrip(owner);
    const pending = await createUpload(owner, trip.body.id);
    await fetch(pending.body.upload.url, {
      body: Buffer.from("pdf bytes"),
      headers: pending.body.upload.headers,
      method: "PUT",
    });
    await pool.query(
      "UPDATE trip_documents SET created_at = '2027-01-01T00:00:00Z'::timestamptz WHERE id = $1",
      [pending.body.document.id],
    );
    const lockClient = await pool.connect();
    await lockClient.query("BEGIN");
    await lockClient.query(
      "SELECT id FROM trip_documents WHERE id = $1 FOR UPDATE",
      [pending.body.document.id],
    );
    const completion = mutation(
      app,
      "post",
      `/api/trips/${trip.body.id}/documents/${pending.body.document.id}/complete`,
    )
      .set("Cookie", owner.cookie)
      .send({})
      .then((response) => response);
    try {
      await waitForDatabaseLock();
      await expect(
        documentsRepository.cleanupStalePending(
          new Date("2027-01-01T01:00:00.000Z"),
          100,
        ),
      ).resolves.toBe(0);
      await lockClient.query("COMMIT");
      expect((await completion).status).toBe(201);
      expect(
        (
          await pool.query(
            "SELECT status FROM trip_documents WHERE id = $1",
            [pending.body.document.id],
          )
        ).rows[0]?.status,
      ).toBe("ready");
      expect((await pool.query("SELECT id FROM storage_cleanup_outbox")).rowCount).toBe(0);
    } finally {
      await lockClient.query("ROLLBACK").catch(() => undefined);
      lockClient.release();
    }
  });

  it("creates and completes Trip-wide cleanup for every document object", async () => {
    const trip = await createTrip(owner);
    const first = await createReadyDocument(owner, trip.body.id);
    const second = await createReadyDocument(owner, trip.body.id);

    const deleted = await mutation(app, "delete", `/api/trips/${trip.body.id}`).set(
      "Cookie",
      owner.cookie,
    );
    expect(deleted.status).toBe(204);
    expect(
      (
        await pool.query(
          "SELECT storage_key FROM storage_cleanup_outbox WHERE reason = 'trip_delete' ORDER BY storage_key",
        )
      ).rows,
    ).toEqual(
      [first.storageKey, second.storageKey]
        .sort()
        .map((storageKey) => ({ storage_key: storageKey })),
    );

    await expect(processIncompleteOutbox()).resolves.toBe(2);
    for (const storageKey of [first.storageKey, second.storageKey]) {
      await expect(
        s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: storageKey })),
      ).rejects.toThrow();
    }
  });

  it("keeps HTTP deletion durable while Redis is temporarily unavailable", async () => {
    const trip = await createTrip(owner);
    const document = await createReadyDocument(owner, trip.body.id);
    const admin = redisConnection(1);
    try {
      await admin.call("CLIENT", "PAUSE", "1000", "ALL");
      const deleted = await mutation(
        app,
        "delete",
        `/api/trips/${trip.body.id}/documents/${document.documentId}`,
      ).set("Cookie", owner.cookie);
      expect(deleted.status).toBe(204);
      expect(
        (
          await pool.query(
            "SELECT completed_at FROM storage_cleanup_outbox WHERE storage_key = $1",
            [document.storageKey],
          )
        ).rows,
      ).toEqual([{ completed_at: null }]);

      await expect(processIncompleteOutbox()).resolves.toBe(1);
      await expect(
        s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: document.storageKey })),
      ).rejects.toThrow();
    } finally {
      await admin.quit();
    }
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
    expect(
      (
        await pool.query(
          "SELECT storage_key, reason FROM storage_cleanup_outbox WHERE storage_key = $1",
          [valid[8]],
        )
      ).rows,
    ).toEqual([{ reason: "trip_delete", storage_key: valid[8] }]);
  });
});

async function closeRedis(...connections: Array<Redis | undefined>): Promise<void> {
  await Promise.all(
    connections.map(async (connection) => {
      if (connection && connection.status !== "end") await connection.quit();
    }),
  );
}
