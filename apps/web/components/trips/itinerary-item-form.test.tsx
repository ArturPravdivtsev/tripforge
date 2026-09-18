import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ItineraryPlaceInput } from "@tripforge/contracts";
import { describe, expect, it, vi } from "vitest";

const place: ItineraryPlaceInput = {
  address: "Asakusa, Tokyo",
  latitude: 35.7148,
  longitude: 139.7967,
  name: "Senso-ji",
  provider: "maptiler",
  providerReference: "poi.123",
};

vi.mock("@/components/places/place-search-combobox", () => ({
  PlaceSearchCombobox: ({
    onChange,
    onSelectName,
    selected,
  }: {
    onChange: (value: ItineraryPlaceInput | null) => void;
    onSelectName?: (name: string) => void;
    selected: ItineraryPlaceInput | null;
  }) => (
    <div>
      <span>{selected?.name ?? "No selected place"}</span>
      <button
        type="button"
        onClick={() => {
          onChange(place);
          onSelectName?.(place.name);
        }}
      >
        Choose test place
      </button>
      <button type="button" onClick={() => onChange(null)}>Remove test place</button>
    </div>
  ),
}));

import { ItineraryItemForm } from "./itinerary-item-form";

const defaults = {
  kind: "activity" as const,
  notes: "",
  place: null,
  startTime: "",
  title: "",
};

describe("ItineraryItemForm place integration", () => {
  it("autofills only a blank title and submits the selected snapshot", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(
      <ItineraryItemForm
        defaultValues={defaults}
        isPending={false}
        submitLabel="Add item"
        onCancel={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Choose test place" }));
    expect(screen.getByLabelText("Title")).toHaveValue("Senso-ji");
    await user.click(screen.getByRole("button", { name: "Add item" }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ place, title: "Senso-ji" }),
        expect.anything(),
      ),
    );
  });

  it("preserves a meaningful title and supports place removal/cancel", async () => {
    const onCancel = vi.fn();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(
      <ItineraryItemForm
        defaultValues={{ ...defaults, place, title: "Morning temple visit" }}
        isPending={false}
        submitLabel="Save item"
        onCancel={onCancel}
        onSubmit={onSubmit}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Choose test place" }));
    expect(screen.getByLabelText("Title")).toHaveValue("Morning temple visit");
    await user.click(screen.getByRole("button", { name: "Remove test place" }));
    await user.click(screen.getByRole("button", { name: "Save item" }));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ place: null, title: "Morning temple visit" }),
        expect.anything(),
      ),
    );

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
