import type {
  NotificationTarget,
  UserNotification,
} from "@tripforge/contracts";

const roleLabels = { editor: "Editor", viewer: "Viewer" } as const;

export function notificationCopy(notification: UserNotification): string {
  const actor = notification.actor?.displayName ?? "A traveler";
  const trip = `“${notification.trip.name}”`;

  switch (notification.type) {
    case "trip_shared":
      return `${actor} shared ${trip} with you as ${roleLabels[notification.data.role]}.`;
    case "trip_role_changed":
      return `Your role in ${trip} changed from ${roleLabels[notification.data.previousRole]} to ${roleLabels[notification.data.nextRole]}.`;
    case "trip_access_revoked":
      return `Your access to ${trip} was removed.`;
    case "trip_deleted":
      return `${trip} was deleted.`;
    case "reservation_added":
      return `${actor} added a reservation to ${trip}: ${notification.data.title}.`;
    case "expense_added":
      return `${actor} added an expense to ${trip}: ${notification.data.title}.`;
    case "document_ready":
      return `${actor} added a document to ${trip}: ${notification.data.title}.`;
  }
}

export function notificationTargetHref(
  target: NotificationTarget | null,
): string | null {
  if (!target) return null;
  const trip = `/trips/${encodeURIComponent(target.tripId)}`;
  switch (target.type) {
    case "trip":
      return trip;
    case "reservations":
      return `${trip}/reservations`;
    case "expenses":
      return `${trip}/expenses`;
    case "documents":
      return `${trip}/documents`;
  }
}

export function formatNotificationTime(value: string): string {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
