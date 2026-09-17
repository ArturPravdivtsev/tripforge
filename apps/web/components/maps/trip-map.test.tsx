import type { PropsWithChildren } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { TripDestination } from "@tripforge/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mapMethods = vi.hoisted(() => ({
  easeTo: vi.fn(),
  fitBounds: vi.fn(),
  getZoom: vi.fn(() => 4),
}));

vi.mock("maplibre-gl", () => ({ setWorkerUrl: vi.fn() }));

vi.mock("react-map-gl/maplibre", async () => {
  const React = await import("react");
  type FakeMapProps = PropsWithChildren<{
    onClick?: (event: { lngLat: { lat: number; lng: number } }) => void;
    onError?: () => void;
    onLoad?: () => void;
  }>;

  return {
    default: React.forwardRef<unknown, FakeMapProps>(function FakeMap(
      { children, onClick, onError, onLoad },
      ref,
    ) {
      React.useImperativeHandle(ref, () => mapMethods);
      React.useEffect(() => onLoad?.(), [onLoad]);
      return (
        <div data-testid="map">
          <button
            onClick={() => onClick?.({ lngLat: { lat: 35.7, lng: 139.7 } })}
            type="button"
          >
            Map surface
          </button>
          <button onClick={onError} type="button">Fail map</button>
          {children}
        </div>
      );
    }),
    Marker: ({ children }: PropsWithChildren) => <div>{children}</div>,
    NavigationControl: () => <div>Zoom controls</div>,
    Popup: ({ children }: PropsWithChildren) => <div>{children}</div>,
  };
});

import { TripMap } from "./trip-map";

const destinations: TripDestination[] = [
  {
    createdAt: "2027-01-01T00:00:00.000Z",
    id: "tokyo",
    latitude: 35.6762,
    longitude: 139.6503,
    name: "Tokyo",
    position: 0,
    updatedAt: "2027-01-01T00:00:00.000Z",
  },
  {
    createdAt: "2027-01-01T00:00:00.000Z",
    id: "new-york",
    latitude: 40.7128,
    longitude: -74.006,
    name: "New York",
    position: 1,
    updatedAt: "2027-01-01T00:00:00.000Z",
  },
];

const baseProps = {
  canEdit: true,
  destinations,
  mapStyle: "https://example.test/style.json",
  onEditLocation: vi.fn(),
  onMapClick: vi.fn(),
  onSelectDestination: vi.fn(),
};

describe("TripMap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("derives named markers, fits bounds, and selects a marker", async () => {
    const user = userEvent.setup();
    render(<TripMap {...baseProps} />);

    expect(screen.getByRole("button", { name: "Select Tokyo on map" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Select New York on map" })).toBeVisible();
    expect(mapMethods.fitBounds).toHaveBeenCalledWith(
      [
        [-74.006, 35.6762],
        [139.6503, 40.7128],
      ],
      expect.objectContaining({ maxZoom: 12, padding: 48 }),
    );

    await user.click(screen.getByRole("button", { name: "Select Tokyo on map" }));
    expect(baseProps.onSelectDestination).toHaveBeenCalledWith("tokyo");
  });

  it("creates a preview only from map clicks in location-pick mode", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<TripMap {...baseProps} />);

    await user.click(screen.getByRole("button", { name: "Map surface" }));
    expect(baseProps.onMapClick).not.toHaveBeenCalled();

    rerender(
      <TripMap
        {...baseProps}
        editingDestinationId="tokyo"
        preview={{ latitude: 35.7, longitude: 139.7 }}
      />,
    );
    expect(screen.getByRole("img", { name: "Location preview" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Map surface" }));
    expect(baseProps.onMapClick).toHaveBeenCalledWith({
      latitude: 35.7,
      longitude: 139.7,
    });
  });

  it("isolates map runtime failures", async () => {
    const user = userEvent.setup();
    render(<TripMap {...baseProps} />);

    await user.click(screen.getByRole("button", { name: "Fail map" }));
    expect(screen.getByText(/Map is temporarily unavailable/)).toBeVisible();
  });
});
