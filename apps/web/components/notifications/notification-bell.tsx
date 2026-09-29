"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { notificationsApi } from "@/lib/api/notifications";
import { notificationKeys } from "@/lib/notifications/query-keys";

export function NotificationBell() {
  const count = useQuery({
    queryKey: notificationKeys.unreadCount(),
    queryFn: ({ signal }) => notificationsApi.unreadCount({ signal }),
  });
  const unreadCount = count.data?.unreadCount ?? 0;

  return (
    <Link
      href="/notifications"
      aria-label={
        unreadCount > 0
          ? `Notifications, ${unreadCount} unread`
          : "Notifications, no unread notifications"
      }
      className="relative inline-flex min-h-10 min-w-10 items-center justify-center rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-2 text-sm font-semibold transition hover:bg-[var(--surface-muted)]"
    >
      <span aria-hidden="true">🔔</span>
      {unreadCount > 0 ? (
        <span aria-hidden="true" className="absolute -right-1.5 -top-1.5 min-w-5 rounded-full bg-[var(--primary)] px-1 text-center text-[0.6875rem] leading-5 text-[var(--primary-foreground)]">
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      ) : null}
    </Link>
  );
}
