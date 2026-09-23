import { Injectable } from "@nestjs/common";
import type { Queue } from "bullmq";

import {
  CLEANUP_RETRY,
  JOB_NAMES,
  JOB_RETENTION,
  MAINTENANCE_BATCH_SIZE,
} from "./background-jobs.constants";
import { StorageCleanupOutboxRepository } from "./storage-cleanup-outbox.repository";

type CleanupQueue = Pick<Queue, "add" | "getJob">;

@Injectable()
export class CleanupOutboxDispatcher {
  constructor(private readonly outbox: StorageCleanupOutboxRepository) {}

  async dispatch(queue: CleanupQueue): Promise<number> {
    const records = await this.outbox.listDispatchable(MAINTENANCE_BATCH_SIZE);
    let added = 0;

    for (const { id } of records) {
      const jobId = cleanupJobId(id);
      const existing = await queue.getJob(jobId);
      if (!existing) {
        await queue.add(
          JOB_NAMES.cleanupObject,
          { outboxId: id },
          { ...CLEANUP_RETRY, ...JOB_RETENTION, jobId },
        );
        added += 1;
      }
      await this.outbox.markDispatched(id);
    }
    return added;
  }
}

export function cleanupJobId(outboxId: string): string {
  return `storage-cleanup-${outboxId}`;
}
