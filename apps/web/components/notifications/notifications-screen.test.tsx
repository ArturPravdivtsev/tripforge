import type { NotificationPage, UserNotification } from "@tripforge/contracts";
import { act, cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { notificationsApi } from "@/lib/api/notifications";
import { renderWithQueryClient } from "@/test-utils";

import { NotificationsScreen } from "./notifications-screen";

const baseNotification: UserNotification = {
  actor: { displayName: "Anna", userId: "actor" },
  createdAt: "2027-01-01T10:00:00.000Z",
  data: { role: "editor" },
  id: "notification-1",
  readAt: null,
  target: { type: "trip", tripId: "trip-1" },
  trip: { id: "trip-1", name: "Japan" },
  type: "trip_shared",
};

describe("NotificationsScreen", () => {
  beforeEach(() => {
    vi.spyOn(notificationsApi, "unreadCount").mockResolvedValue({ unreadCount: 0 });
    vi.spyOn(notificationsApi, "setReadState").mockResolvedValue({
      ...baseNotification,
      readAt: "2027-01-01T11:00:00.000Z",
    });
    vi.spyOn(notificationsApi, "markAllRead").mockResolvedValue({ updatedCount: 0 });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("shows loading and then an intentional empty state", async () => {
    let resolvePage!: (page: NotificationPage) => void;
    vi.spyOn(notificationsApi, "list").mockReturnValue(
      new Promise((resolve) => {
        resolvePage = resolve;
      }),
    );
    renderWithQueryClient(<NotificationsScreen />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading notifications…");

    await act(async () => resolvePage({ items: [], nextCursor: null }));
    expect(await screen.findByText("No notifications yet.")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
  });

  it("shows a safe list error", async () => {
    vi.spyOn(notificationsApi, "list").mockRejectedValue(new Error("offline"));
    renderWithQueryClient(<NotificationsScreen />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Notifications could not be loaded.",
    );
  });

  it("loads cursor pages without rendering duplicate IDs", async () => {
    const duplicate = {
      ...baseNotification,
      id: "notification-2",
      type: "expense_added" as const,
      data: { title: "Dinner" },
      target: { type: "expenses" as const, tripId: "trip-1" },
    };
    const final = {
      ...baseNotification,
      id: "notification-3",
      type: "trip_deleted" as const,
      data: {},
      target: null,
    };
    vi.spyOn(notificationsApi, "list").mockImplementation((query) =>
      Promise.resolve(
        query?.cursor
          ? { items: [duplicate, final], nextCursor: null }
          : { items: [baseNotification, duplicate], nextCursor: "next" },
      ),
    );
    const user = userEvent.setup();
    renderWithQueryClient(<NotificationsScreen />);

    expect(await screen.findByText(/shared “Japan”/)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByText("“Japan” was deleted.")).toBeVisible();
    expect(screen.getAllByText(/added an expense/)).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
    expect(
      screen
        .getAllByRole("link", { name: "Open" })
        .find((link) => link.getAttribute("href") === "/trips/trip-1"),
    ).toBeDefined();
  });

  it("optimistically toggles read state and rolls back on failure", async () => {
    vi.spyOn(notificationsApi, "list").mockResolvedValue({
      items: [baseNotification],
      nextCursor: null,
    });
    vi.mocked(notificationsApi.unreadCount).mockResolvedValue({ unreadCount: 1 });
    let rejectMutation!: (reason: Error) => void;
    vi.mocked(notificationsApi.setReadState).mockReturnValue(
      new Promise((_resolve, reject) => {
        rejectMutation = reject;
      }),
    );
    const user = userEvent.setup();
    renderWithQueryClient(<NotificationsScreen />);

    await user.click(
      await screen.findByRole("button", { name: "Mark as read" }),
    );
    expect(screen.getByRole("button", { name: "Mark as unread" })).toBeVisible();

    await act(async () => rejectMutation(new Error("offline")));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "previous state was restored",
    );
    expect(screen.getByRole("button", { name: "Mark as read" })).toBeVisible();
  });

  it("optimistically marks all cached notifications read", async () => {
    vi.spyOn(notificationsApi, "list").mockResolvedValue({
      items: [baseNotification],
      nextCursor: null,
    });
    vi.mocked(notificationsApi.unreadCount).mockResolvedValue({ unreadCount: 1 });
    let resolveMutation!: (value: { updatedCount: number }) => void;
    vi.mocked(notificationsApi.markAllRead).mockReturnValue(
      new Promise((resolve) => {
        resolveMutation = resolve;
      }),
    );
    const user = userEvent.setup();
    renderWithQueryClient(<NotificationsScreen />);

    await user.click(await screen.findByRole("button", { name: "Mark all as read" }));
    expect(screen.getByRole("button", { name: "Mark as unread" })).toBeVisible();
    await act(async () => resolveMutation({ updatedCount: 1 }));
  });
});
