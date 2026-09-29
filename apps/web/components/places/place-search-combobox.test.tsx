import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithQueryClient } from "@/test-utils";
import { expectNoAxeViolations } from "@/test/accessibility";

import { PlaceSearchCombobox } from "./place-search-combobox";

const responseBody = {
  attribution: "© MapTiler © OpenStreetMap contributors",
  features: [
    {
      center: [139.7967, 35.7148],
      id: "poi.123",
      place_name: "Senso-ji, Tokyo",
      text: "Senso-ji",
    },
    {
      center: [139.81, 35.71],
      id: "poi.456",
      place_name: "Sensō-ji Gate, Tokyo",
      text: "Sensō-ji Gate",
    },
  ],
  type: "FeatureCollection",
};

describe("PlaceSearchCombobox", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_MAPTILER_KEY", "public-key");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("does not search before the three-character debounced threshold", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    renderWithQueryClient(
      <PlaceSearchCombobox onChange={vi.fn()} selected={null} />,
    );

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "Se" } });
    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(fetcher).not.toHaveBeenCalled();
    expect(screen.getByText("Enter at least 3 characters.")).toBeVisible();
  });

  it("supports keyboard option navigation, selection, and attribution", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(responseBody), { status: 200 }),
      ),
    );
    const onChange = vi.fn();
    const { container } = renderWithQueryClient(
      <PlaceSearchCombobox onChange={onChange} selected={null} />,
    );
    const input = screen.getByRole("combobox");

    fireEvent.change(input, { target: { value: "Senso" } });
    expect(await screen.findByRole("option", { name: /Senso-ji, Tokyo/ })).toBeVisible();
    expect(screen.getByText("MapTiler")).toBeVisible();
    await expectNoAxeViolations(container);

    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(screen.getByRole("option", { name: /Sensō-ji Gate/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    fireEvent.keyDown(input, { key: "ArrowUp" });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Senso-ji", provider: "maptiler" }),
    );
  });

  it("keeps editing usable when search fails and closes with Escape", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("", { status: 503 })),
    );
    renderWithQueryClient(
      <PlaceSearchCombobox onChange={vi.fn()} selected={null} />,
    );
    const input = screen.getByRole("combobox");

    fireEvent.change(input, { target: { value: "Senso" } });
    expect(
      await screen.findByText("Could not search places right now."),
    ).toBeVisible();
    fireEvent.keyDown(input, { key: "Escape" });
    expect(input).toHaveAttribute("aria-expanded", "false");
  });

  it("distinguishes loading and no-results states", async () => {
    let resolveFetch: ((response: Response) => void) | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            resolveFetch = resolve;
          }),
      ),
    );
    renderWithQueryClient(
      <PlaceSearchCombobox onChange={vi.fn()} selected={null} />,
    );

    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "Nowhere" },
    });
    expect(await screen.findByText("Searching…")).toBeVisible();
    await waitFor(() => expect(resolveFetch).toBeTypeOf("function"));
    resolveFetch?.(
      new Response(
        JSON.stringify({ ...responseBody, features: [] }),
        { status: 200 },
      ),
    );
    expect(await screen.findByText("No places found.")).toBeVisible();
  });

  it("selects an option with the pointer", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(responseBody), { status: 200 }),
      ),
    );
    const onChange = vi.fn();
    const user = userEvent.setup();
    renderWithQueryClient(
      <PlaceSearchCombobox onChange={onChange} selected={null} />,
    );

    await user.type(screen.getByRole("combobox"), "Senso");
    await user.click(
      await screen.findByRole("option", { name: /Sensō-ji Gate, Tokyo/ }),
    );
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Sensō-ji Gate" }),
    );
  });

  it("renders a persisted selection without a provider request", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const onChange = vi.fn();
    const user = userEvent.setup();
    renderWithQueryClient(
      <PlaceSearchCombobox
        onChange={onChange}
        selected={{
          address: "Asakusa, Tokyo",
          latitude: 35.7148,
          longitude: 139.7967,
          name: "Senso-ji",
          provider: "maptiler",
          providerReference: "poi.123",
        }}
      />,
    );

    expect(screen.getByText("Senso-ji")).toBeVisible();
    expect(fetcher).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(null));
  });
});
