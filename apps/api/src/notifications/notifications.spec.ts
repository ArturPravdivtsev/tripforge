import { describe, expect, it } from "vitest";

import {
  decodeNotificationCursor,
  encodeNotificationCursor,
  InvalidNotificationCursorError,
} from "./notification-cursor";
import { parseNotificationPayload } from "./notification-payload";

const cursor = {
  createdAt: "2027-01-01T00:00:00.000Z",
  id: "00000000-0000-4000-8000-000000000001",
  v: 1 as const,
};

describe("notification cursor", () => {
  it("roundtrips a versioned timestamp and UUID", () => {
    expect(decodeNotificationCursor(encodeNotificationCursor(cursor))).toEqual(
      cursor,
    );
  });

  it.each([
    "not+base64",
    Buffer.from("not json").toString("base64url"),
    Buffer.from(JSON.stringify({ ...cursor, v: 2 })).toString("base64url"),
    Buffer.from(JSON.stringify({ ...cursor, createdAt: "yesterday" })).toString(
      "base64url",
    ),
    Buffer.from(JSON.stringify({ ...cursor, id: "not-a-uuid" })).toString(
      "base64url",
    ),
  ])("rejects malformed cursor %s", (value) => {
    expect(() => decodeNotificationCursor(value)).toThrow(
      InvalidNotificationCursorError,
    );
  });
});

describe("notification payload validation", () => {
  it("maps every supported payload variant", () => {
    expect(
      parseNotificationPayload(
        { type: "trip_shared", data: { role: "editor" } },
        "trip_shared",
      ),
    ).toEqual({ type: "trip_shared", data: { role: "editor" } });
    expect(
      parseNotificationPayload(
        {
          type: "trip_role_changed",
          data: { previousRole: "editor", nextRole: "viewer" },
        },
        "trip_role_changed",
      ),
    ).toMatchObject({ data: { nextRole: "viewer", previousRole: "editor" } });
    expect(
      parseNotificationPayload(
        { type: "expense_added", data: { title: "Dinner" } },
        "expense_added",
      ),
    ).toEqual({ type: "expense_added", data: { title: "Dinner" } });
    expect(
      parseNotificationPayload(
        { type: "trip_deleted", data: {} },
        "trip_deleted",
      ),
    ).toEqual({ type: "trip_deleted", data: {} });
  });

  it("rejects mismatched types and malformed data", () => {
    expect(() =>
      parseNotificationPayload(
        { type: "expense_added", data: { title: "Dinner" } },
        "reservation_added",
      ),
    ).toThrow();
    expect(() =>
      parseNotificationPayload(
        { type: "trip_shared", data: { role: "owner" } },
        "trip_shared",
      ),
    ).toThrow();
    expect(() =>
      parseNotificationPayload(
        { type: "document_ready", data: { title: "   " } },
        "document_ready",
      ),
    ).toThrow();
  });
});
