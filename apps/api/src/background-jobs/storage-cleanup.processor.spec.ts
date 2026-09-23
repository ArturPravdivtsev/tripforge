import type { Job } from "bullmq";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { S3StorageService } from "../storage/s3-storage.service";
import type { StorageCleanupOutboxRepository } from "./storage-cleanup-outbox.repository";
import { StorageCleanupProcessor } from "./storage-cleanup.processor";

const outboxId = "10000000-0000-4000-8000-000000000001";

describe("StorageCleanupProcessor", () => {
  const outbox = {
    find: vi.fn(),
    markCompleted: vi.fn(),
  };
  const storage = { deleteObject: vi.fn() };
  const processor = new StorageCleanupProcessor(
    outbox as unknown as StorageCleanupOutboxRepository,
    storage as unknown as S3StorageService,
  );

  beforeEach(() => vi.clearAllMocks());

  it.each([
    undefined,
    { completedAt: new Date(), failedAt: null, id: outboxId, storageKey: "key" },
    { completedAt: null, failedAt: new Date(), id: outboxId, storageKey: "key" },
  ])("is a no-op for missing or terminal outbox state", async (record) => {
    outbox.find.mockResolvedValue(record);
    await expect(processor.process(job())).resolves.toBe("noop");
    expect(storage.deleteObject).not.toHaveBeenCalled();
  });

  it("deletes the authoritative DB key and marks completion", async () => {
    outbox.find.mockResolvedValue({
      completedAt: null,
      failedAt: null,
      id: outboxId,
      storageKey: "opaque-key",
    });
    await expect(processor.process(job())).resolves.toBe("completed");
    expect(storage.deleteObject).toHaveBeenCalledWith("opaque-key");
    expect(outbox.markCompleted).toHaveBeenCalledWith(outboxId);
  });

  it("propagates storage and completion failures for BullMQ retry", async () => {
    outbox.find.mockResolvedValue({
      completedAt: null,
      failedAt: null,
      id: outboxId,
      storageKey: "opaque-key",
    });
    storage.deleteObject.mockRejectedValueOnce(new Error("S3 unavailable"));
    await expect(processor.process(job())).rejects.toThrow("S3 unavailable");
    expect(outbox.markCompleted).not.toHaveBeenCalled();

    storage.deleteObject.mockResolvedValue(undefined);
    outbox.markCompleted.mockRejectedValueOnce(new Error("DB unavailable"));
    await expect(processor.process(job())).rejects.toThrow("DB unavailable");
    expect(storage.deleteObject).toHaveBeenCalledTimes(2);

    outbox.markCompleted.mockResolvedValue(undefined);
    await expect(processor.process(job())).resolves.toBe("completed");
    expect(storage.deleteObject).toHaveBeenCalledTimes(3);
    expect(outbox.markCompleted).toHaveBeenCalledWith(outboxId);
  });

  it("rejects malformed queue data before accessing storage", async () => {
    await expect(processor.process(job({ outboxId: "bad" }))).rejects.toThrow(
      "Invalid storage cleanup job payload",
    );
    expect(outbox.find).not.toHaveBeenCalled();
  });
});

function job(data: unknown = { outboxId }): Job<unknown> {
  return { data } as Job<unknown>;
}
