import {
  Injectable,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Job, Queue, Worker } from "bullmq";
import Redis from "ioredis";

import { AppLogger } from "../observability/app-logger.service";
import { ObservabilityMetrics } from "../observability/metrics.service";
import { withInternalSpan } from "../observability/tracing";
import {
  JOB_NAMES,
  MAINTENANCE_QUEUE,
  type MaintenanceJobName,
  WORKER_CONCURRENCY,
} from "./background-jobs.constants";
import { CleanupOutboxDispatcher } from "./cleanup-outbox-dispatcher.service";
import { JobSchedulerRegistrar } from "./job-scheduler-registrar.service";
import { parseStorageCleanupJobData } from "./job-payload";
import { StalePendingCleaner } from "./stale-pending-cleaner.service";
import { StorageCleanupOutboxRepository } from "./storage-cleanup-outbox.repository";
import { StorageCleanupProcessor } from "./storage-cleanup.processor";

type MaintenanceData = Record<string, unknown>;
type MaintenanceQueue = Queue<
  MaintenanceData,
  unknown,
  MaintenanceJobName
>;
type MaintenanceWorker = Worker<
  MaintenanceData,
  unknown,
  MaintenanceJobName
>;

@Injectable()
export class BackgroundJobsService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private queue?: MaintenanceQueue;
  private queueRedis?: Redis;
  private worker?: MaintenanceWorker;
  private workerRedis?: Redis;

  constructor(
    private readonly config: ConfigService,
    private readonly cleanup: StorageCleanupProcessor,
    private readonly dispatcher: CleanupOutboxDispatcher,
    private readonly schedulers: JobSchedulerRegistrar,
    private readonly stalePending: StalePendingCleaner,
    private readonly outbox: StorageCleanupOutboxRepository,
    private readonly logger: AppLogger,
    private readonly metrics: ObservabilityMetrics,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const redisUrl = this.config.getOrThrow<string>("REDIS_URL");
    this.queueRedis = new Redis(redisUrl, { maxRetriesPerRequest: 1 });
    this.workerRedis = new Redis(redisUrl, { maxRetriesPerRequest: null });
    this.queueRedis.on("error", () =>
      this.logger.event("error", "worker.redis.queue.error"),
    );
    this.workerRedis.on("error", () =>
      this.logger.event("error", "worker.redis.consumer.error"),
    );

    this.queue = new Queue(MAINTENANCE_QUEUE, {
      connection: this.queueRedis,
    });
    this.worker = new Worker(
      MAINTENANCE_QUEUE,
      (job) => this.process(job),
      {
        concurrency: WORKER_CONCURRENCY,
        connection: this.workerRedis,
      },
    );
    this.worker.on("completed", (job) => {
      const noWork =
        job.name === JOB_NAMES.dispatchCleanupOutbox && job.returnvalue === 0;
      this.logger.event(
        noWork ? "debug" : "info",
        noWork ? "worker.job.no_work" : "worker.job.completed",
        {
          attempt: job.attemptsMade,
          jobName: job.name,
          outcome: "succeeded",
        },
      );
    });
    this.worker.on("failed", (job, error) => {
      void this.handleFailure(job, error);
    });
    this.worker.on("error", () => {
      this.logger.event("error", "worker.consumer.error");
    });

    try {
      await Promise.all([
        this.queue.waitUntilReady(),
        this.worker.waitUntilReady(),
      ]);
      await this.schedulers.register(this.queue);
      this.logger.event("info", "worker.ready", {
        concurrency: WORKER_CONCURRENCY,
        queue: MAINTENANCE_QUEUE,
      });
    } catch (error) {
      await this.closeResources();
      throw error;
    }
  }

  async onApplicationShutdown(): Promise<void> {
    this.logger.event("info", "worker.shutdown.started");
    await this.closeResources();
    this.logger.event("info", "worker.shutdown.completed");
  }

  private async process(
    job: Job<MaintenanceData, unknown, MaintenanceJobName>,
  ): Promise<unknown> {
    const startedAt = process.hrtime.bigint();
    const attempt = job.attemptsMade + 1;
    this.logger.event(
      job.name === JOB_NAMES.dispatchCleanupOutbox ? "debug" : "info",
      "worker.job.started",
      { attempt, jobName: job.name },
    );

    if (job.name === JOB_NAMES.dispatchCleanupOutbox) {
      return this.processDispatcherJob(job, startedAt);
    }

    return withInternalSpan(
      `worker ${job.name}`,
      { "job.attempt": attempt, "job.name": job.name },
      async (span) => {
        try {
          let result: unknown;
          if (job.name === JOB_NAMES.cleanupObject) {
            result = await this.cleanup.process(job);
          } else if (job.name === JOB_NAMES.cleanupStalePending) {
            result = await this.stalePending.cleanup();
          } else {
            throw new Error("Unsupported maintenance job");
          }
          span.setAttribute("job.outcome", "succeeded");
          this.metrics.workerJob(
            job.name,
            "succeeded",
            elapsedSeconds(startedAt),
          );
          return result;
        } catch (error) {
          const attempts = job.opts.attempts ?? 1;
          const outcome = job.attemptsMade + 1 < attempts ? "retried" : "failed";
          span.setAttribute("job.outcome", outcome);
          this.metrics.workerJob(job.name, outcome, elapsedSeconds(startedAt));
          throw error;
        }
      },
    );
  }

  private async processDispatcherJob(
    job: Job<MaintenanceData, unknown, MaintenanceJobName>,
    startedAt: bigint,
  ): Promise<number> {
    try {
      const result = await this.dispatcher.dispatch(this.requireQueue());
      this.metrics.workerJob(
        job.name,
        "succeeded",
        elapsedSeconds(startedAt),
      );
      return result;
    } catch (error) {
      const attempts = job.opts.attempts ?? 1;
      const outcome = job.attemptsMade + 1 < attempts ? "retried" : "failed";
      this.metrics.workerJob(job.name, outcome, elapsedSeconds(startedAt));
      throw error;
    }
  }

  private async handleFailure(
    job: Job<MaintenanceData, unknown, MaintenanceJobName> | undefined,
    error: Error,
  ): Promise<void> {
    const attempts = job?.opts.attempts ?? 1;
    const exhausted = Boolean(job && job.attemptsMade >= attempts);
    this.logger.event("error", "worker.job.failed", {
      attempt: job?.attemptsMade ?? 0,
      attempts,
      errorType: error.name,
      exhausted,
      jobName: job?.name ?? "unknown",
    });
    if (!job || job.name !== JOB_NAMES.cleanupObject || !exhausted) return;

    try {
      const { outboxId } = parseStorageCleanupJobData(job.data);
      await this.outbox.markFailed(outboxId);
    } catch (markError) {
      this.logger.event("error", "worker.outbox.mark_failed.error", {
        errorType: markError instanceof Error ? markError.name : "unknown",
        jobName: job.name,
      });
    }
  }

  private requireQueue(): MaintenanceQueue {
    if (!this.queue) throw new Error("Maintenance queue is not initialized");
    return this.queue;
  }

  private async closeResources(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
    await closeRedis(this.workerRedis);
    await closeRedis(this.queueRedis);
  }
}

function elapsedSeconds(startedAt: bigint): number {
  return Number(process.hrtime.bigint() - startedAt) / 1_000_000_000;
}

async function closeRedis(redis: Redis | undefined): Promise<void> {
  if (!redis || redis.status === "end") return;
  await redis.quit();
}
