import { render, screen } from "@testing-library/react";
import type { TripDestination } from "@tripforge/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TripMapPanel } from "./trip-map-panel";

const destination: TripDestination = {
  createdAt: "2027-01-01T00:00:00.000Z",
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  latitude: null,
  longitude: null,
  name: "Tokyo",
  position: 0,
  updatedAt: "2027-01-01T00:00:00.000Z",
};

const callbacks = {
  onEditLocation: vi.fn(),
  onMapClick: vi.fn(),
  onSelectMapPoint: vi.fn(),
};

describe("TripMapPanel", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("shows a controlled unavailable state when the browser key is missing", () => {
    vi.stubEnv("NEXT_PUBLIC_MAPTILER_KEY", "");
    render(
      <TripMapPanel
        canEdit
        days={[]}
        destinations={[destination]}
        itineraryItems={[]}
        {...callbacks}
      />,
    );

    expect(
      screen.getByText(/MapTiler browser key is not configured/),
    ).toBeVisible();
  });

  it("uses a compact state instead of a world map when no destination is located", () => {
    vi.stubEnv("NEXT_PUBLIC_MAPTILER_KEY", "test-browser-key");
    render(
      <TripMapPanel
        canEdit
        days={[]}
        destinations={[destination]}
        itineraryItems={[]}
        {...callbacks}
      />,
    );

    expect(
      screen.getByText("Add a destination location or itinerary place to show it on the map."),
    ).toBeVisible();
    expect(screen.queryByLabelText("Loading map")).not.toBeInTheDocument();
  });
});
