import { isUUID } from "class-validator";

export type StorageCleanupJobData = Readonly<{ outboxId: string }>;

export function parseStorageCleanupJobData(
  value: unknown,
): StorageCleanupJobData {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).length !== 1 ||
    !("outboxId" in value) ||
    typeof value.outboxId !== "string" ||
    !isUUID(value.outboxId)
  ) {
    throw new Error("Invalid storage cleanup job payload");
  }
  return { outboxId: value.outboxId };
}
