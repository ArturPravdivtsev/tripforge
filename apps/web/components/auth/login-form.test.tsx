import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { authApi } from "@/lib/api/auth";
import { ApiClientError } from "@/lib/api/errors";
import { renderWithQueryClient } from "@/test-utils";

import { LoginForm } from "./login-form";

const replace = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, replace }),
}));

describe("LoginForm", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    replace.mockReset();
    refresh.mockReset();
  });

  it("renders accessible fields and validates required input", async () => {
    const user = userEvent.setup();
    renderWithQueryClient(<LoginForm />);

    expect(screen.getByRole("textbox", { name: "Email" })).toHaveAttribute(
      "autocomplete",
      "email",
    );
    expect(screen.getByLabelText("Password")).toHaveAttribute(
      "autocomplete",
      "current-password",
    );
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByText("Enter your email address.")).toBeVisible();
    expect(screen.getByText("Enter your password.")).toBeVisible();
  });

  it("submits and navigates after a successful login", async () => {
    const loginRequest = vi.spyOn(authApi, "login").mockResolvedValue({
      user: { displayName: "Arthur", email: "user@example.com", id: "1" },
    });
    const user = userEvent.setup();
    renderWithQueryClient(<LoginForm />);

    await user.type(screen.getByRole("textbox", { name: "Email" }), " user@example.com ");
    await user.type(screen.getByLabelText("Password"), " password with spaces ");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() =>
      expect(loginRequest).toHaveBeenCalledWith({
        email: "user@example.com",
        password: " password with spaces ",
      }),
    );
    expect(replace).toHaveBeenCalledWith("/");
  });

  it("keeps invalid credentials generic", async () => {
    vi.spyOn(authApi, "login").mockRejectedValue(
      new ApiClientError("backend text", 401, "INVALID_CREDENTIALS"),
    );
    const user = userEvent.setup();
    renderWithQueryClient(<LoginForm />);

    await user.type(screen.getByRole("textbox", { name: "Email" }), "user@example.com");
    await user.type(screen.getByLabelText("Password"), "wrong");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Email or password is incorrect.",
    );
  });

  it("sanitizes network failures", async () => {
    vi.spyOn(authApi, "login").mockRejectedValue(new TypeError("network detail"));
    const user = userEvent.setup();
    renderWithQueryClient(<LoginForm />);

    await user.type(screen.getByRole("textbox", { name: "Email" }), "user@example.com");
    await user.type(screen.getByLabelText("Password"), "password");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Something went wrong. Please try again.",
    );
  });
});
