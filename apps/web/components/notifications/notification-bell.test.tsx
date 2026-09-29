import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { notificationsApi } from "@/lib/api/notifications";
import { renderWithQueryClient } from "@/test-utils";

import { NotificationBell } from "./notification-bell";

describe("NotificationBell", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it.each([
    [0, null],
    [1, "1"],
    [42, "42"],
    [99, "99"],
    [100, "99+"],
  ] as const)("renders unread count %s as %s", async (count, badge) => {
    vi.spyOn(notificationsApi, "unreadCount").mockResolvedValue({
      unreadCount: count,
    });
    renderWithQueryClient(<NotificationBell />);

    const link = await screen.findByRole("link", {
      name: count > 0
        ? `Notifications, ${count} unread`
        : "Notifications, no unread notifications",
    });
    expect(link).toHaveAttribute("href", "/notifications");
    if (badge) expect(screen.getByText(badge)).toBeVisible();
    else expect(screen.queryByText("0")).not.toBeInTheDocument();
  });
});
