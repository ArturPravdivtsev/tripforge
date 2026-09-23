import type { Queue } from "bullmq";
import { describe, expect, it, vi } from "vitest";

import {
  JOB_NAMES,
  JOB_RETENTION,
  OUTBOX_DISPATCH_INTERVAL_MS,
  SCHEDULER_IDS,
  STALE_PENDING_AGE_MS,
  STALE_PENDING_SCAN_INTERVAL_MS,
} from "./background-jobs.constants";
import { JobSchedulerRegistrar } from "./job-scheduler-registrar.service";
import { StalePendingCleaner } from "./stale-pending-cleaner.service";
import type { TripDocumentsRepository } from "../trips/trip-documents.repository";

describe("maintenance services", () => {
  it("uses the exact stale threshold and bounded repository path", async () => {
    const documents = { cleanupStalePending: vi.fn().mockResolvedValue(2) };
    const cleaner = new StalePendingCleaner(
      documents as unknown as TripDocumentsRepository,
    );
    const now = new Date("2027-01-01T12:00:00.000Z");

    await expect(cleaner.cleanup(now)).resolves.toBe(2);
    expect(documents.cleanupStalePending).toHaveBeenCalledWith(
      new Date(now.getTime() - STALE_PENDING_AGE_MS),
      100,
    );
  });

  it("upserts stable BullMQ v6 scheduler identities", async () => {
    const queue = { upsertJobScheduler: vi.fn().mockResolvedValue({}) };
    const registrar = new JobSchedulerRegistrar();
    await registrar.register(
      queue as unknown as Pick<Queue, "upsertJobScheduler">,
    );

    expect(queue.upsertJobScheduler).toHaveBeenNthCalledWith(
      1,
      SCHEDULER_IDS.cleanupOutbox,
      { every: OUTBOX_DISPATCH_INTERVAL_MS },
      {
        data: {},
        name: JOB_NAMES.dispatchCleanupOutbox,
        opts: JOB_RETENTION,
      },
    );
    expect(queue.upsertJobScheduler).toHaveBeenNthCalledWith(
      2,
      SCHEDULER_IDS.staleDocuments,
      { every: STALE_PENDING_SCAN_INTERVAL_MS },
      {
        data: {},
        name: JOB_NAMES.cleanupStalePending,
        opts: JOB_RETENTION,
      },
    );
  });
});
