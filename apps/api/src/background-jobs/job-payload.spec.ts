import { describe, expect, it } from "vitest";

import { parseStorageCleanupJobData } from "./job-payload";

describe("parseStorageCleanupJobData", () => {
  it("accepts the minimal UUID payload", () => {
    expect(
      parseStorageCleanupJobData({
        outboxId: "10000000-0000-4000-8000-000000000001",
      }),
    ).toEqual({ outboxId: "10000000-0000-4000-8000-000000000001" });
  });

  it.each([
    null,
    {},
    { outboxId: "invalid" },
    { outboxId: "10000000-0000-4000-8000-000000000001", storageKey: "x" },
  ])("rejects malformed or expanded payloads: %j", (payload) => {
    expect(() => parseStorageCleanupJobData(payload)).toThrow(
      "Invalid storage cleanup job payload",
    );
  });
});
