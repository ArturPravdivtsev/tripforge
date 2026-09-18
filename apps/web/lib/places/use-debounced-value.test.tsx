import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useDebouncedValue } from "./use-debounced-value";

function Probe({ value }: Readonly<{ value: string }>) {
  return <output>{useDebouncedValue(value)}</output>;
}

describe("useDebouncedValue", () => {
  it("publishes only the latest rapid value after 300 ms", () => {
    vi.useFakeTimers();
    const view = render(<Probe value="Sen" />);
    view.rerender(<Probe value="Sens" />);
    view.rerender(<Probe value="Senso" />);

    expect(screen.getByText("Sen")).toBeVisible();
    act(() => vi.advanceTimersByTime(299));
    expect(screen.getByText("Sen")).toBeVisible();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByText("Senso")).toBeVisible();
    vi.useRealTimers();
  });
});
