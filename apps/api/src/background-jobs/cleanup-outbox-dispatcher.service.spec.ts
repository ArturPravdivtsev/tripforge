import type { Queue } from "bullmq";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  CLEANUP_RETRY,
  JOB_NAMES,
  JOB_RETENTION,
  MAINTENANCE_BATCH_SIZE,
} from "./background-jobs.constants";
import {
  cleanupJobId,
  CleanupOutboxDispatcher,
} from "./cleanup-outbox-dispatcher.service";
import type { StorageCleanupOutboxRepository } from "./storage-cleanup-outbox.repository";

const firstId = "10000000-0000-4000-8000-000000000001";
const secondId = "10000000-0000-4000-8000-000000000002";

describe("CleanupOutboxDispatcher", () => {
  const outbox = {
    listDispatchable: vi.fn(),
    markDispatched: vi.fn(),
    measureBacklog: vi.fn().mockResolvedValue({
      incomplete: 0,
      oldestCreatedAt: null,
    }),
  };
  const queue = { add: vi.fn(), getJob: vi.fn() };
  const metrics = { updateOutbox: vi.fn() };
  const dispatcher = new CleanupOutboxDispatcher(
    outbox as unknown as StorageCleanupOutboxRepository,
    metrics as never,
  );

  beforeEach(() => vi.clearAllMocks());

  it("dispatches a bounded batch with minimal payload and deterministic ID", async () => {
    outbox.listDispatchable.mockResolvedValue([{ id: firstId }]);
    queue.getJob.mockResolvedValue(undefined);
    queue.add.mockResolvedValue({ id: cleanupJobId(firstId) });

    await expect(
      dispatcher.dispatch(queue as unknown as Pick<Queue, "add" | "getJob">),
    ).resolves.toBe(1);
    expect(outbox.listDispatchable).toHaveBeenCalledWith(MAINTENANCE_BATCH_SIZE);
    expect(queue.add).toHaveBeenCalledWith(
      JOB_NAMES.cleanupObject,
      { outboxId: firstId },
      {
        ...CLEANUP_RETRY,
        ...JOB_RETENTION,
        jobId: cleanupJobId(firstId),
      },
    );
    expect(cleanupJobId(firstId)).not.toContain(":");
    expect(outbox.markDispatched).toHaveBeenCalledWith(firstId);
    expect(outbox.measureBacklog).toHaveBeenCalledOnce();
    expect(metrics.updateOutbox).toHaveBeenCalledWith(0, 0);
  });

  it("does not duplicate an existing waiting/active/completed/failed identity", async () => {
    outbox.listDispatchable.mockResolvedValue([
      { id: firstId },
      { id: secondId },
    ]);
    queue.getJob.mockResolvedValue({ id: "existing" });

    await expect(
      dispatcher.dispatch(queue as unknown as Pick<Queue, "add" | "getJob">),
    ).resolves.toBe(0);
    expect(queue.add).not.toHaveBeenCalled();
    expect(outbox.markDispatched).toHaveBeenCalledTimes(2);
  });
});
