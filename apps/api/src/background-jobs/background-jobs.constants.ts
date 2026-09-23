export const MAINTENANCE_QUEUE = "tripforge-maintenance";

export const JOB_NAMES = {
  cleanupObject: "storage.cleanup-object",
  dispatchCleanupOutbox: "storage.dispatch-cleanup-outbox",
  cleanupStalePending: "documents.cleanup-stale-pending",
} as const;

export type MaintenanceJobName = (typeof JOB_NAMES)[keyof typeof JOB_NAMES];

export const SCHEDULER_IDS = {
  cleanupOutbox: "storage-outbox-dispatcher",
  staleDocuments: "stale-document-cleaner",
} as const;

export const OUTBOX_DISPATCH_INTERVAL_MS = 30_000;
export const STALE_PENDING_SCAN_INTERVAL_MS = 60 * 60 * 1000;
export const STALE_PENDING_AGE_MS = 60 * 60 * 1000;
export const MAINTENANCE_BATCH_SIZE = 100;
export const WORKER_CONCURRENCY = 5;

export const JOB_RETENTION = {
  removeOnComplete: { age: 7 * 24 * 60 * 60, count: 1_000 },
  removeOnFail: { age: 30 * 24 * 60 * 60, count: 5_000 },
} as const;

export const CLEANUP_RETRY = {
  attempts: 8,
  backoff: { delay: 5_000, type: "exponential" as const },
} as const;
