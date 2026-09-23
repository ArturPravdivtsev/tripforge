import { randomUUID } from "node:crypto";

import { Job, Queue, QueueEvents, Worker } from "bullmq";
import {
  RedisContainer,
  type StartedRedisContainer,
} from "@testcontainers/redis";
import Redis from "ioredis";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { SCHEDULER_IDS } from "../src/background-jobs/background-jobs.constants";
import { JobSchedulerRegistrar } from "../src/background-jobs/job-scheduler-registrar.service";

const REDIS_IMAGE = "redis:8.10.1-alpine";

describe("BullMQ with real Redis", () => {
  let redis: StartedRedisContainer;

  beforeAll(async () => {
    redis = await new RedisContainer(REDIS_IMAGE)
      .withCommand([
        "redis-server",
        "--appendonly",
        "yes",
        "--appendfsync",
        "everysec",
      ])
      .start();
  });

  beforeEach(async () => {
    const client = connection(1);
    await client.flushdb();
    await client.quit();
  });

  afterAll(async () => {
    await redis?.stop();
  });

  it("runs a real worker and retries before eventual completion", async () => {
    const name = queueName();
    const queueConnection = connection(1);
    const eventConnection = connection(null);
    const workerConnection = connection(null);
    const queue = new Queue(name, { connection: queueConnection });
    const events = new QueueEvents(name, { connection: eventConnection });
    let runs = 0;
    const worker = new Worker(
      name,
      async () => {
        runs += 1;
        if (runs < 3) throw new Error("transient failure");
        return "done";
      },
      { connection: workerConnection },
    );

    try {
      await Promise.all([events.waitUntilReady(), worker.waitUntilReady()]);
      const job = await queue.add(
        "retry-test",
        {},
        { attempts: 3, backoff: { delay: 20, type: "exponential" } },
      );
      await expect(job.waitUntilFinished(events, 5_000)).resolves.toBe("done");
      expect(runs).toBe(3);
      expect((await Job.fromId(queue, job.id ?? ""))?.attemptsMade).toBe(3);
    } finally {
      await worker.close();
      await events.close();
      await queue.close();
      await close(workerConnection, eventConnection, queueConnection);
    }
  });

  it("deduplicates a deterministic job ID while the job exists", async () => {
    const queueConnection = connection(1);
    const queue = new Queue(queueName(), { connection: queueConnection });
    try {
      const options = { delay: 60_000, jobId: "storage-cleanup-outbox-id" };
      const first = await queue.add("storage.cleanup-object", { outboxId: "one" }, options);
      const second = await queue.add("storage.cleanup-object", { outboxId: "one" }, options);
      expect(second.id).toBe(first.id);
      expect(await queue.getJobs(["delayed", "waiting"])).toHaveLength(1);
    } finally {
      await queue.close();
      await close(queueConnection);
    }
  });

  it("upserts two scheduler configurations without duplication", async () => {
    const queueConnection = connection(1);
    const queue = new Queue(queueName(), { connection: queueConnection });
    const registrar = new JobSchedulerRegistrar();
    try {
      await registrar.register(queue);
      await registrar.register(queue);
      const schedulers = await queue.getJobSchedulers(0, 10, true);
      expect(schedulers.map(({ key }) => key).sort()).toEqual(
        Object.values(SCHEDULER_IDS).sort(),
      );
    } finally {
      await queue.close();
      await close(queueConnection);
    }
  });

  it("processes queued work after an independent worker start", async () => {
    const name = queueName();
    const queueConnection = connection(1);
    const eventConnection = connection(null);
    const queue = new Queue(name, { connection: queueConnection });
    const events = new QueueEvents(name, { connection: eventConnection });
    let worker: Worker | undefined;
    let workerConnection: Redis | undefined;
    try {
      await events.waitUntilReady();
      const job = await queue.add("worker-restart", {});
      expect(await job.getState()).toBe("waiting");

      workerConnection = connection(null);
      worker = new Worker(name, async () => "resumed", {
        connection: workerConnection,
      });
      await worker.waitUntilReady();
      await expect(job.waitUntilFinished(events, 5_000)).resolves.toBe("resumed");
    } finally {
      await worker?.close();
      await events.close();
      await queue.close();
      await close(workerConnection, eventConnection, queueConnection);
    }
  });

  it("retains a delayed job across an AOF-backed Redis restart", async () => {
    const name = queueName();
    const jobId = "survives-redis-restart";
    const firstConnection = connection(1);
    const queue = new Queue(name, { connection: firstConnection });
    await queue.add("persisted", {}, { delay: 60_000, jobId });
    const admin = connection(1);
    await admin.call("WAITAOF", "1", "0", "5000");
    await queue.close();
    await close(admin, firstConnection);

    await redis.restart({ timeout: 10_000 });

    const secondConnection = connection(1);
    const restored = new Queue(name, { connection: secondConnection });
    try {
      expect(await Job.fromId(restored, jobId)).toBeDefined();
    } finally {
      await restored.close();
      await close(secondConnection);
    }
  });

  function connection(maxRetriesPerRequest: number | null): Redis {
    return new Redis(redis.getConnectionUrl(), { maxRetriesPerRequest });
  }
});

function queueName(): string {
  return `tripforge-maintenance-test-${randomUUID()}`;
}

async function close(...connections: Array<Redis | undefined>): Promise<void> {
  await Promise.all(
    connections.map(async (connection) => {
      if (connection && connection.status !== "end") await connection.quit();
    }),
  );
}
