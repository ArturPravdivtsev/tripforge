import { Injectable } from "@nestjs/common";
import type { Job } from "bullmq";

import { S3StorageService } from "../storage/s3-storage.service";
import { parseStorageCleanupJobData } from "./job-payload";
import { StorageCleanupOutboxRepository } from "./storage-cleanup-outbox.repository";

@Injectable()
export class StorageCleanupProcessor {
  constructor(
    private readonly outbox: StorageCleanupOutboxRepository,
    private readonly storage: S3StorageService,
  ) {}

  async process(job: Job<unknown>): Promise<"completed" | "noop"> {
    const { outboxId } = parseStorageCleanupJobData(job.data);
    const record = await this.outbox.find(outboxId);
    if (!record || record.completedAt || record.failedAt) return "noop";

    await this.storage.deleteObject(record.storageKey);
    await this.outbox.markCompleted(outboxId);
    return "completed";
  }
}
