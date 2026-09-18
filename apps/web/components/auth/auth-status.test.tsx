import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { authApi } from "@/lib/api/auth";
import { ApiClientError } from "@/lib/api/errors";
import { tripKeys } from "@/lib/trips/query-keys";
import { renderWithQueryClient } from "@/test-utils";

import { AuthStatus } from "./auth-status";

describe("AuthStatus", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the authenticated identity discovered from the API", async () => {
    vi.spyOn(authApi, "me").mockResolvedValue({
      user: { displayName: "Arthur", email: "user@example.com", id: "1" },
    });
    renderWithQueryClient(<AuthStatus />);

    expect(screen.getByRole("status")).toHaveTextContent("Checking session…");
    expect(await screen.findByText("Arthur")).toBeVisible();
    expect(screen.getByRole("button", { name: "Logout" })).toBeVisible();
  });

  it("treats an unauthenticated response as guest state", async () => {
    vi.spyOn(authApi, "me").mockRejectedValue(
      new ApiClientError("Unauthenticated", 401, "UNAUTHENTICATED"),
    );
    renderWithQueryClient(<AuthStatus />);

    expect(await screen.findByRole("link", { name: "Sign in" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Create account" })).toBeVisible();
  });

  it("logs out and transitions to guest state", async () => {
    vi.spyOn(authApi, "me").mockResolvedValue({
      user: { displayName: null, email: "user@example.com", id: "1" },
    });
    const logout = vi.spyOn(authApi, "logout").mockResolvedValue();
    const user = userEvent.setup();
    const { queryClient } = renderWithQueryClient(<AuthStatus />);
    queryClient.setQueryData(tripKeys.list(1, 6), { items: [] });
    queryClient.setQueryData(tripKeys.detail("trip-id"), { id: "trip-id" });
    queryClient.setQueryData(tripKeys.members("trip-id"), []);
    queryClient.setQueryData(tripKeys.destinations("trip-id"), []);
    queryClient.setQueryData(tripKeys.days("trip-id"), []);
    queryClient.setQueryData(tripKeys.itinerary("trip-id"), []);
    queryClient.setQueryData(tripKeys.reservations("trip-id"), []);
    queryClient.setQueryData(
      tripKeys.reservation("trip-id", "reservation-id"),
      { id: "reservation-id" },
    );

    await user.click(await screen.findByRole("button", { name: "Logout" }));

    expect(logout).toHaveBeenCalledOnce();
    expect(await screen.findByRole("link", { name: "Sign in" })).toBeVisible();
    expect(queryClient.getQueryData(tripKeys.list(1, 6))).toBeUndefined();
    expect(queryClient.getQueryData(tripKeys.detail("trip-id"))).toBeUndefined();
    expect(queryClient.getQueryData(tripKeys.members("trip-id"))).toBeUndefined();
    expect(queryClient.getQueryData(tripKeys.destinations("trip-id"))).toBeUndefined();
    expect(queryClient.getQueryData(tripKeys.days("trip-id"))).toBeUndefined();
    expect(queryClient.getQueryData(tripKeys.itinerary("trip-id"))).toBeUndefined();
    expect(queryClient.getQueryData(tripKeys.reservations("trip-id"))).toBeUndefined();
    expect(
      queryClient.getQueryData(
        tripKeys.reservation("trip-id", "reservation-id"),
      ),
    ).toBeUndefined();
  });

  it("shows a recoverable state for server or network failures", async () => {
    vi.spyOn(authApi, "me").mockRejectedValue(new TypeError("offline"));
    renderWithQueryClient(<AuthStatus />);

    expect(await screen.findByText("Session unavailable")).toBeVisible();
    expect(screen.getByRole("button", { name: "Retry" })).toBeVisible();
  });
});
