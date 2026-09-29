import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { MobileNavigation } from "./mobile-navigation";

describe("MobileNavigation", () => {
  it("opens navigation and closes it with Escape", async () => {
    const user = userEvent.setup();

    render(<MobileNavigation />);

    expect(
      screen.queryByRole("navigation", { name: "Mobile navigation" }),
    ).not.toBeInTheDocument();

    const trigger = screen.getByRole("button", { name: "Menu, open navigation" });
    await user.click(trigger);

    const navigation = screen.getByRole("navigation", {
      name: "Mobile navigation",
    });

    expect(within(navigation).getByRole("link", { name: "Trips" })).toBeVisible();

    await user.keyboard("{Escape}");

    expect(
      screen.queryByRole("navigation", { name: "Mobile navigation" }),
    ).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
