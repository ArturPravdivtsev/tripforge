import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { authApi } from "@/lib/api/auth";
import { ApiClientError } from "@/lib/api/errors";

import { AuthStatus } from "./auth-status";

describe("AuthStatus", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the authenticated identity discovered from the API", async () => {
    vi.spyOn(authApi, "me").mockResolvedValue({
      user: { displayName: "Arthur", email: "user@example.com", id: "1" },
    });
    render(<AuthStatus />);

    expect(screen.getByRole("status")).toHaveTextContent("Checking session…");
    expect(await screen.findByText("Arthur")).toBeVisible();
    expect(screen.getByRole("button", { name: "Logout" })).toBeVisible();
  });

  it("treats an unauthenticated response as guest state", async () => {
    vi.spyOn(authApi, "me").mockRejectedValue(
      new ApiClientError("Unauthenticated", 401, "UNAUTHENTICATED"),
    );
    render(<AuthStatus />);

    expect(await screen.findByRole("link", { name: "Sign in" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Create account" })).toBeVisible();
  });

  it("logs out and transitions to guest state", async () => {
    vi.spyOn(authApi, "me").mockResolvedValue({
      user: { displayName: null, email: "user@example.com", id: "1" },
    });
    const logout = vi.spyOn(authApi, "logout").mockResolvedValue();
    const user = userEvent.setup();
    render(<AuthStatus />);

    await user.click(await screen.findByRole("button", { name: "Logout" }));

    expect(logout).toHaveBeenCalledOnce();
    expect(await screen.findByRole("link", { name: "Sign in" })).toBeVisible();
  });

  it("shows a recoverable state for server or network failures", async () => {
    vi.spyOn(authApi, "me").mockRejectedValue(new TypeError("offline"));
    render(<AuthStatus />);

    expect(await screen.findByText("Session unavailable")).toBeVisible();
    expect(screen.getByRole("button", { name: "Retry" })).toBeVisible();
  });
});
