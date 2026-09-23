import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Job, Queue, Worker } from "bullmq";
import Redis from "ioredis";

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
  private readonly logger = new Logger(BackgroundJobsService.name);
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
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const redisUrl = this.config.getOrThrow<string>("REDIS_URL");
    this.queueRedis = new Redis(redisUrl, { maxRetriesPerRequest: 1 });
    this.workerRedis = new Redis(redisUrl, { maxRetriesPerRequest: null });
    this.queueRedis.on("error", (error) =>
      this.logger.error(`Queue Redis error: ${error.message}`),
    );
    this.workerRedis.on("error", (error) =>
      this.logger.error(`Worker Redis error: ${error.message}`),
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
      this.logger.log(
        `Job completed name=${job.name} id=${job.id ?? "unknown"} attempt=${job.attemptsMade}`,
      );
    });
    this.worker.on("failed", (job, error) => {
      void this.handleFailure(job, error);
    });
    this.worker.on("error", (error) => {
      this.logger.error(`BullMQ worker error: ${error.message}`, error.stack);
    });

    try {
      await Promise.all([
        this.queue.waitUntilReady(),
        this.worker.waitUntilReady(),
      ]);
      await this.schedulers.register(this.queue);
      this.logger.log(
        `Worker ready queue=${MAINTENANCE_QUEUE} concurrency=${WORKER_CONCURRENCY}`,
      );
    } catch (error) {
      await this.closeResources();
      throw error;
    }
  }

  async onApplicationShutdown(): Promise<void> {
    this.logger.log("Worker shutdown started");
    await this.closeResources();
    this.logger.log("Worker shutdown completed");
  }

  private async process(
    job: Job<MaintenanceData, unknown, MaintenanceJobName>,
  ): Promise<unknown> {
    this.logger.log(
      `Job started name=${job.name} id=${job.id ?? "unknown"} attempt=${job.attemptsMade + 1}`,
    );
    if (job.name === JOB_NAMES.cleanupObject) {
      return this.cleanup.process(job);
    }
    if (job.name === JOB_NAMES.dispatchCleanupOutbox) {
      return this.dispatcher.dispatch(this.requireQueue());
    }
    if (job.name === JOB_NAMES.cleanupStalePending) {
      return this.stalePending.cleanup();
    }
    throw new Error(`Unsupported maintenance job: ${job.name}`);
  }

  private async handleFailure(
    job: Job<MaintenanceData, unknown, MaintenanceJobName> | undefined,
    error: Error,
  ): Promise<void> {
    const attempts = job?.opts.attempts ?? 1;
    const exhausted = Boolean(job && job.attemptsMade >= attempts);
    this.logger.error(
      `Job failed name=${job?.name ?? "unknown"} id=${job?.id ?? "unknown"} attempt=${job?.attemptsMade ?? 0}/${attempts} exhausted=${exhausted}: ${error.message}`,
      exhausted ? error.stack : undefined,
    );
    if (!job || job.name !== JOB_NAMES.cleanupObject || !exhausted) return;

    try {
      const { outboxId } = parseStorageCleanupJobData(job.data);
      await this.outbox.markFailed(outboxId);
    } catch (markError) {
      this.logger.error(
        `Failed to record exhausted cleanup job id=${job.id ?? "unknown"}`,
        markError instanceof Error ? markError.stack : undefined,
      );
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

async function closeRedis(redis: Redis | undefined): Promise<void> {
  if (!redis || redis.status === "end") return;
  await redis.quit();
}
