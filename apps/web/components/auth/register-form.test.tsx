import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { authApi } from "@/lib/api/auth";
import { ApiClientError } from "@/lib/api/errors";
import { renderWithQueryClient } from "@/test-utils";

import { RegisterForm } from "./register-form";

const replace = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, replace }),
}));

describe("RegisterForm", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    replace.mockReset();
    refresh.mockReset();
  });

  it("renders accessible registration fields and navigation", () => {
    renderWithQueryClient(<RegisterForm />);

    expect(screen.getByRole("textbox", { name: "Display name" })).toHaveAttribute(
      "autocomplete",
      "name",
    );
    expect(screen.getByRole("textbox", { name: "Email" })).toHaveAttribute(
      "type",
      "email",
    );
    expect(screen.getByLabelText("Password")).toHaveAttribute(
      "autocomplete",
      "new-password",
    );
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/login",
    );
  });

  it("shows email and password validation errors", async () => {
    const user = userEvent.setup();
    renderWithQueryClient(<RegisterForm />);

    await user.type(screen.getByRole("textbox", { name: "Email" }), "invalid");
    await user.type(screen.getByLabelText("Password"), "short");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByText("Enter a valid email address.")).toBeVisible();
    expect(document.getElementById("register-password-error")).toHaveTextContent(
      "Use at least 15 characters.",
    );
  });

  it("preserves password spaces and prevents duplicate pending submission", async () => {
    let resolveRequest: (() => void) | undefined;
    const registerRequest = vi.spyOn(authApi, "register").mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRequest = () =>
            resolve({ user: { displayName: null, email: "user@example.com", id: "1" } });
        }),
    );
    const user = userEvent.setup();
    renderWithQueryClient(<RegisterForm />);

    await user.type(screen.getByRole("textbox", { name: "Email" }), " user@example.com ");
    await user.type(screen.getByLabelText("Password"), " 123456789012345 ");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByRole("button", { name: "Creating account…" })).toBeDisabled();
    expect(registerRequest).toHaveBeenCalledWith({
      displayName: undefined,
      email: "user@example.com",
      password: " 123456789012345 ",
    });
    await user.click(screen.getByRole("button", { name: "Creating account…" }));
    expect(registerRequest).toHaveBeenCalledOnce();

    resolveRequest?.();
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
  });

  it("presents duplicate-account errors safely", async () => {
    vi.spyOn(authApi, "register").mockRejectedValue(
      new ApiClientError("backend text", 409, "ACCOUNT_ALREADY_EXISTS"),
    );
    const user = userEvent.setup();
    renderWithQueryClient(<RegisterForm />);

    await user.type(screen.getByRole("textbox", { name: "Email" }), "user@example.com");
    await user.type(screen.getByLabelText("Password"), "123456789012345");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "An account with this email already exists.",
    );
  });
});
