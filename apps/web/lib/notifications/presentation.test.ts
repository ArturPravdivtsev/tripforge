import type { UserNotification } from "@tripforge/contracts";
import { describe, expect, it } from "vitest";

import {
  notificationCopy,
  notificationTargetHref,
} from "./presentation";

const common = {
  actor: { displayName: "Anna", userId: "actor" },
  createdAt: "2027-01-01T00:00:00.000Z",
  id: "notification",
  readAt: null,
  target: null,
  trip: { id: "trip", name: "Japan 2027" },
} as const;

describe("notification presentation", () => {
  it("renders every structured notification type", () => {
    const notifications: UserNotification[] = [
      { ...common, type: "trip_shared", data: { role: "editor" } },
      {
        ...common,
        type: "trip_role_changed",
        data: { previousRole: "editor", nextRole: "viewer" },
      },
      { ...common, type: "trip_access_revoked", data: {} },
      { ...common, type: "trip_deleted", data: {} },
      {
        ...common,
        type: "reservation_added",
        data: { title: "Hotel" },
      },
      { ...common, type: "expense_added", data: { title: "Dinner" } },
      {
        ...common,
        type: "document_ready",
        data: { title: "Tickets" },
      },
    ];
    expect(notifications.map(notificationCopy)).toEqual([
      "Anna shared “Japan 2027” with you as Editor.",
      "Your role in “Japan 2027” changed from Editor to Viewer.",
      "Your access to “Japan 2027” was removed.",
      "“Japan 2027” was deleted.",
      "Anna added a reservation to “Japan 2027”: Hotel.",
      "Anna added an expense to “Japan 2027”: Dinner.",
      "Anna added a document to “Japan 2027”: Tickets.",
    ]);
  });

  it("uses an actor fallback and generates only predefined internal targets", () => {
    expect(
      notificationCopy({
        ...common,
        actor: null,
        type: "expense_added",
        data: { title: "Dinner" },
      }),
    ).toContain("A traveler added");
    expect(notificationTargetHref({ type: "trip", tripId: "a/b" })).toBe(
      "/trips/a%2Fb",
    );
    expect(notificationTargetHref({ type: "reservations", tripId: "trip" })).toBe(
      "/trips/trip/reservations",
    );
    expect(notificationTargetHref({ type: "expenses", tripId: "trip" })).toBe(
      "/trips/trip/expenses",
    );
    expect(notificationTargetHref({ type: "documents", tripId: "trip" })).toBe(
      "/trips/trip/documents",
    );
    expect(notificationTargetHref(null)).toBeNull();
  });
});
