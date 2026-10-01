import { Injectable } from "@nestjs/common";
import type { Queue } from "bullmq";

import { ObservabilityMetrics } from "../observability/metrics.service";
import { withInternalSpan } from "../observability/tracing";
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
  constructor(
    private readonly outbox: StorageCleanupOutboxRepository,
    private readonly metrics: ObservabilityMetrics = new ObservabilityMetrics(),
  ) {}

  async dispatch(queue: CleanupQueue): Promise<number> {
    const records = await this.outbox.listDispatchable(MAINTENANCE_BATCH_SIZE);
    if (records.length === 0) {
      await this.updateBacklogMetrics();
      return 0;
    }

    return withInternalSpan(
      "storage.cleanup.dispatch",
      { "job.name": JOB_NAMES.dispatchCleanupOutbox },
      async () => this.dispatchRecords(queue, records),
    );
  }

  private async dispatchRecords(
    queue: CleanupQueue,
    records: Array<{ id: string }>,
  ): Promise<number> {
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
    await this.updateBacklogMetrics();
    return added;
  }

  private async updateBacklogMetrics(): Promise<void> {
    const backlog = await this.outbox.measureBacklog();
    const oldestAgeSeconds = backlog.oldestCreatedAt
      ? Math.max((Date.now() - backlog.oldestCreatedAt.getTime()) / 1_000, 0)
      : 0;
    this.metrics.updateOutbox(backlog.incomplete, oldestAgeSeconds);
  }
}

export function cleanupJobId(outboxId: string): string {
  return `storage-cleanup-${outboxId}`;
}
