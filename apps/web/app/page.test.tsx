import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import HomePage from "./page";

describe("HomePage", () => {
  it("identifies TripForge and confirms that the application is running", () => {
    render(<HomePage />);

    expect(
      screen.getByRole("heading", { level: 1, name: "TripForge" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("The web application is running."),
    ).toBeVisible();
  });
});
