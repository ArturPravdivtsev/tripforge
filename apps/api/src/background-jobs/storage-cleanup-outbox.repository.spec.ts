import { describe, expect, it } from "vitest";

import { normalizeOldestCreatedAt } from "./storage-cleanup-outbox.repository";

describe("normalizeOldestCreatedAt", () => {
  it("normalizes PostgreSQL aggregate timestamps and preserves null", () => {
    const timestamp = "2026-10-01T17:33:13.000Z";

    expect(normalizeOldestCreatedAt(timestamp)).toEqual(new Date(timestamp));
    expect(normalizeOldestCreatedAt(null)).toBeNull();
  });
});
