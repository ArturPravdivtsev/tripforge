import type {
  NotificationPayload,
  TripMemberRole,
  UserNotificationType,
} from "@tripforge/contracts";

export function parseNotificationPayload(
  value: unknown,
  expectedType: UserNotificationType,
): NotificationPayload {
  if (!isRecord(value) || value.type !== expectedType || !isRecord(value.data)) {
    throw new Error(`Invalid notification payload for type ${expectedType}`);
  }

  switch (expectedType) {
    case "trip_shared": {
      if (!isRole(value.data.role)) throw invalidPayload(expectedType);
      return { type: expectedType, data: { role: value.data.role } };
    }
    case "trip_role_changed": {
      if (!isRole(value.data.previousRole) || !isRole(value.data.nextRole)) {
        throw invalidPayload(expectedType);
      }
      return {
        type: expectedType,
        data: {
          nextRole: value.data.nextRole,
          previousRole: value.data.previousRole,
        },
      };
    }
    case "reservation_added":
    case "expense_added":
    case "document_ready": {
      if (typeof value.data.title !== "string" || value.data.title.trim() === "") {
        throw invalidPayload(expectedType);
      }
      return { type: expectedType, data: { title: value.data.title } };
    }
    case "trip_access_revoked":
    case "trip_deleted":
      return { type: expectedType, data: {} };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRole(value: unknown): value is TripMemberRole {
  return value === "editor" || value === "viewer";
}

function invalidPayload(type: UserNotificationType): Error {
  return new Error(`Invalid notification payload for type ${type}`);
}
