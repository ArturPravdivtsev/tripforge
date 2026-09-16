import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Trip, TripsPage } from "@tripforge/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiClientError } from "@/lib/api/errors";
import { tripsApi } from "@/lib/api/trips";
import { renderWithQueryClient } from "@/test-utils";

import { TripsDashboard } from "./trips-dashboard";

const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
}));

const japan: Trip = {
  accessRole: "owner",
  createdAt: "2027-01-01T00:00:00.000Z",
  endsOn: "2027-04-28",
  id: "11111111-1111-4111-8111-111111111111",
  name: "Japan 2027",
  startsOn: "2027-04-12",
  updatedAt: "2027-01-01T00:00:00.000Z",
};

function page(items = [japan], overrides: Partial<TripsPage> = {}): TripsPage {
  return {
    items,
    page: 1,
    pageSize: 6,
    total: items.length,
    totalPages: items.length ? 1 : 0,
    ...overrides,
  };
}

describe("TripsDashboard", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    replace.mockReset();
  });

  it("shows initial loading then trip cards", async () => {
    let resolveList: ((value: TripsPage) => void) | undefined;
    vi.spyOn(tripsApi, "list").mockImplementation(
      () => new Promise((resolve) => (resolveList = resolve)),
    );
    renderWithQueryClient(<TripsDashboard page={1} />);

    expect(screen.getByRole("status", { name: "Loading trips" })).toBeVisible();
    resolveList?.(page());
    expect(await screen.findByRole("heading", { name: "Japan 2027" })).toBeVisible();
    expect(screen.getByText("12 Apr 2027 – 28 Apr 2027")).toBeVisible();
  });

  it("shows only the actions allowed by each access role", async () => {
    vi.spyOn(tripsApi, "list").mockResolvedValue(
      page([
        japan,
        { ...japan, accessRole: "editor", id: "editor-id", name: "Editor trip" },
        { ...japan, accessRole: "viewer", id: "viewer-id", name: "Viewer trip" },
      ]),
    );
    renderWithQueryClient(<TripsDashboard page={1} />);

    await screen.findByRole("heading", { name: "Japan 2027" });
    const cards = screen.getAllByRole("heading", { level: 3 }).map(
      (heading) =>
        heading.closest("div[class*='flex min-w-0 flex-col']") as HTMLElement,
    );

    expect(within(cards[0]!).getByRole("link", { name: "Edit" })).toBeVisible();
    expect(within(cards[0]!).getByRole("link", { name: "Open" })).toHaveAttribute(
      "href",
      `/trips/${japan.id}`,
    );
    expect(within(cards[0]!).getByRole("link", { name: "Members" })).toBeVisible();
    expect(within(cards[0]!).getByRole("button", { name: "Delete" })).toBeVisible();
    expect(within(cards[1]!).getByText("editor")).toBeVisible();
    expect(within(cards[1]!).getByRole("link", { name: "Edit" })).toBeVisible();
    expect(within(cards[1]!).getByRole("link", { name: "Members" })).toBeVisible();
    expect(within(cards[1]!).queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
    expect(within(cards[2]!).getByText("viewer")).toBeVisible();
    expect(within(cards[2]!).getByRole("link", { name: "Open" })).toHaveAttribute(
      "href",
      "/trips/viewer-id",
    );
    expect(within(cards[2]!).getByRole("link", { name: "Members" })).toBeVisible();
    expect(within(cards[2]!).queryByRole("link", { name: "Edit" })).not.toBeInTheDocument();
    expect(within(cards[2]!).queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
  });

  it("renders empty, authentication, and retryable error states", async () => {
    vi.spyOn(tripsApi, "list").mockResolvedValueOnce(page([]));
    const empty = renderWithQueryClient(<TripsDashboard page={1} />);
    expect(await screen.findByText("No trips yet")).toBeVisible();
    empty.unmount();

    vi.spyOn(tripsApi, "list").mockRejectedValueOnce(
      new ApiClientError("Unauthenticated", 401, "UNAUTHENTICATED"),
    );
    const guest = renderWithQueryClient(<TripsDashboard page={1} />);
    expect(await screen.findByText("Sign in to view your trips.")).toBeVisible();
    guest.unmount();

    vi.spyOn(tripsApi, "list").mockRejectedValueOnce(new TypeError("offline"));
    renderWithQueryClient(<TripsDashboard page={1} />);
    expect(await screen.findByText("Unable to load trips.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Try again" })).toBeVisible();
  });

  it("uses page-specific query params and renders pagination links", async () => {
    const list = vi.spyOn(tripsApi, "list").mockResolvedValue(
      page([japan], { page: 2, total: 13, totalPages: 3 }),
    );
    renderWithQueryClient(<TripsDashboard page={2} />);

    expect(await screen.findByText("Page 2 of 3")).toBeVisible();
    expect(list).toHaveBeenCalledWith(
      { page: 2, pageSize: 6 },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(screen.getByRole("link", { name: "Previous" })).toHaveAttribute(
      "href",
      "/trips?page=1",
    );
    expect(screen.getByRole("link", { name: "Next" })).toHaveAttribute(
      "href",
      "/trips?page=3",
    );
  });

  it("keeps previous cards visible while the next page loads", async () => {
    let resolveSecondPage: ((value: TripsPage) => void) | undefined;
    const italy = { ...japan, id: "22222222-2222-4222-8222-222222222222", name: "Italy" };
    vi.spyOn(tripsApi, "list").mockImplementation(({ page: requestedPage }) =>
      requestedPage === 1
        ? Promise.resolve(page([japan], { total: 2, totalPages: 2 }))
        : new Promise((resolve) => (resolveSecondPage = resolve)),
    );
    const view = renderWithQueryClient(<TripsDashboard page={1} />);
    await screen.findByRole("heading", { name: "Japan 2027" });

    view.rerender(<TripsDashboard page={2} />);
    expect(screen.getByRole("heading", { name: "Japan 2027" })).toBeVisible();
    expect(screen.getByText("Updating…")).toBeVisible();

    resolveSecondPage?.(
      page([italy], { page: 2, total: 2, totalPages: 2 }),
    );
    expect(await screen.findByRole("heading", { name: "Italy" })).toBeVisible();
  });

  it("removes a trip optimistically and keeps it absent on success", async () => {
    vi.spyOn(tripsApi, "list")
      .mockResolvedValueOnce(page())
      .mockResolvedValue(page([]));
    let resolveDelete: (() => void) | undefined;
    vi.spyOn(tripsApi, "remove").mockImplementation(
      () => new Promise((resolve) => (resolveDelete = resolve)),
    );
    const user = userEvent.setup();
    renderWithQueryClient(<TripsDashboard page={1} />);

    await screen.findByRole("heading", { name: "Japan 2027" });
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(screen.queryByRole("heading", { name: "Japan 2027" })).not.toBeInTheDocument();

    resolveDelete?.();
    expect(await screen.findByText("No trips yet")).toBeVisible();
  });

  it("rolls an optimistic deletion back on failure", async () => {
    vi.spyOn(tripsApi, "list").mockResolvedValue(page());
    let rejectDelete: ((reason: unknown) => void) | undefined;
    vi.spyOn(tripsApi, "remove").mockImplementation(
      () => new Promise((_resolve, reject) => (rejectDelete = reject)),
    );
    const user = userEvent.setup();
    renderWithQueryClient(<TripsDashboard page={1} />);

    await screen.findByRole("heading", { name: "Japan 2027" });
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(screen.queryByRole("heading", { name: "Japan 2027" })).not.toBeInTheDocument();

    rejectDelete?.(new TypeError("internal detail"));
    expect(await screen.findByRole("heading", { name: "Japan 2027" })).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Unable to delete trip. Please try again.",
    );
  });

  it("moves to the previous page after deleting its final item", async () => {
    vi.spyOn(tripsApi, "list").mockResolvedValue(
      page([japan], { page: 3, total: 13, totalPages: 3 }),
    );
    vi.spyOn(tripsApi, "remove").mockResolvedValue();
    const user = userEvent.setup();
    renderWithQueryClient(<TripsDashboard page={3} />);

    await screen.findByRole("heading", { name: "Japan 2027" });
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/trips?page=2"));
  });
});
