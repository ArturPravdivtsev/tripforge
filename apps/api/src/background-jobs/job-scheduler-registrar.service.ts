import { Injectable } from "@nestjs/common";
import type { Queue } from "bullmq";

import {
  JOB_NAMES,
  JOB_RETENTION,
  OUTBOX_DISPATCH_INTERVAL_MS,
  SCHEDULER_IDS,
  STALE_PENDING_SCAN_INTERVAL_MS,
} from "./background-jobs.constants";

type SchedulerQueue = Pick<Queue, "upsertJobScheduler">;

@Injectable()
export class JobSchedulerRegistrar {
  async register(queue: SchedulerQueue): Promise<void> {
    await queue.upsertJobScheduler(
      SCHEDULER_IDS.cleanupOutbox,
      { every: OUTBOX_DISPATCH_INTERVAL_MS },
      {
        data: {},
        name: JOB_NAMES.dispatchCleanupOutbox,
        opts: JOB_RETENTION,
      },
    );
    await queue.upsertJobScheduler(
      SCHEDULER_IDS.staleDocuments,
      { every: STALE_PENDING_SCAN_INTERVAL_MS },
      {
        data: {},
        name: JOB_NAMES.cleanupStalePending,
        opts: JOB_RETENTION,
      },
    );
  }
}
