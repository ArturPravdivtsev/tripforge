import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import HomePage from "./page";

describe("HomePage", () => {
  it("introduces the product, navigation, and future trip action", () => {
    render(<HomePage />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Plan your next adventure",
    );

    const navigation = screen.getByRole("navigation", {
      name: "Primary navigation",
    });

    expect(
      within(navigation).getByRole("link", { name: "Overview" }),
    ).toBeVisible();
    expect(
      within(navigation).getByRole("link", { name: "Trips" }),
    ).toBeVisible();
    expect(
      within(navigation).getByRole("link", { name: "Explore" }),
    ).toBeVisible();

    expect(
      screen.getByRole("link", { name: "Create your account" }),
    ).toHaveAttribute("href", "/register");
    expect(
      screen.getByRole("heading", { name: "Travel together" }),
    ).toBeVisible();
  });
});
