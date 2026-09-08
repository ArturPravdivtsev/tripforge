import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Button } from "./button";

describe("Button", () => {
  it("renders accessible text and forwards the disabled state", () => {
    render(<Button disabled>Create trip</Button>);

    expect(
      screen.getByRole("button", { name: "Create trip" }),
    ).toBeDisabled();
  });

  it("invokes its click handler", async () => {
    const handleClick = vi.fn();
    const user = userEvent.setup();

    render(<Button onClick={handleClick}>Open planner</Button>);
    await user.click(screen.getByRole("button", { name: "Open planner" }));

    expect(handleClick).toHaveBeenCalledOnce();
  });
});
