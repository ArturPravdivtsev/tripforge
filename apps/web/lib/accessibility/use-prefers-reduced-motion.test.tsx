import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { usePrefersReducedMotion } from "./use-prefers-reduced-motion";

describe("usePrefersReducedMotion", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("tracks the reduced-motion media query", () => {
    let matches = true;
    let listener: (() => void) | undefined;
    vi.stubGlobal("matchMedia", () => ({
      addEventListener: (_type: string, next: () => void) => {
        listener = next;
      },
      matches,
      media: "(prefers-reduced-motion: reduce)",
      onchange: null,
      removeEventListener: vi.fn(),
    }));

    const { result } = renderHook(() => usePrefersReducedMotion());
    expect(result.current).toBe(true);

    matches = false;
    vi.stubGlobal("matchMedia", () => ({
      addEventListener: vi.fn(),
      matches,
      media: "(prefers-reduced-motion: reduce)",
      onchange: null,
      removeEventListener: vi.fn(),
    }));
    act(() => listener?.());
    expect(result.current).toBe(false);
  });
});
