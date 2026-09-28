import type {
  MarkAllNotificationsReadResponse,
  NotificationPage,
  NotificationUnreadCount,
  UserNotification,
} from "@tripforge/contracts";

import { apiFetch } from "./client";

type RequestOptions = Readonly<{ signal?: AbortSignal }>;

export const notificationsApi = {
  list(
    input: Readonly<{ cursor?: string; limit?: number }> = {},
    options: RequestOptions = {},
  ): Promise<NotificationPage> {
    const query = new URLSearchParams({ limit: String(input.limit ?? 20) });
    if (input.cursor) query.set("cursor", input.cursor);
    return apiFetch(`/api/notifications?${query.toString()}`, {
      signal: options.signal,
    });
  },

  unreadCount(options: RequestOptions = {}): Promise<NotificationUnreadCount> {
    return apiFetch("/api/notifications/unread-count", {
      signal: options.signal,
    });
  },

  setReadState(notificationId: string, read: boolean): Promise<UserNotification> {
    return apiFetch(`/api/notifications/${notificationId}`, {
      json: { read },
      method: "PATCH",
    });
  },

  markAllRead(): Promise<MarkAllNotificationsReadResponse> {
    return apiFetch("/api/notifications/read-all", { method: "POST" });
  },
};
