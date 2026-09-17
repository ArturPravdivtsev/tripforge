"use client";

import dynamic from "next/dynamic";
import type { TripDestination } from "@tripforge/contracts";

import { hasCoordinates, type MapPoint } from "@/lib/maps/bounds";
import { getMapTilerStyleUrl } from "@/lib/maps/config";

import { MapErrorBoundary } from "./map-error-boundary";

const TripMap = dynamic(
  () => import("./trip-map").then((module) => module.TripMap),
  {
    loading: () => <MapLoading />,
    ssr: false,
  },
);

type TripMapPanelProps = Readonly<{
  canEdit: boolean;
  destinations: readonly TripDestination[];
  editingDestinationId?: string;
  onEditLocation: (destinationId: string) => void;
  onMapClick: (point: MapPoint) => void;
  onSelectDestination: (destinationId?: string) => void;
  preview?: MapPoint;
  selectedDestinationId?: string;
}>;

export function TripMapPanel(props: TripMapPanelProps) {
  const mapStyle = getMapTilerStyleUrl();
  const hasMappedDestinations = props.destinations.some(hasCoordinates);

  return (
    <section aria-labelledby="trip-map-heading" className="space-y-3 border-t border-[var(--border)] pt-5">
      <div>
        <h3 className="font-semibold" id="trip-map-heading">Map</h3>
        <p className="text-sm text-[var(--muted-foreground)]">
          Destination locations are supplemental to the accessible list above.
        </p>
      </div>
      {!mapStyle ? (
        <MapUnavailable>
          Map is unavailable because the MapTiler browser key is not configured.
        </MapUnavailable>
      ) : !hasMappedDestinations && !props.editingDestinationId ? (
        <MapUnavailable>
          {props.canEdit
            ? "Add a location to a destination to show it on the map."
            : "No destination locations have been added yet."}
        </MapUnavailable>
      ) : (
        <MapErrorBoundary
          fallback={
            <MapUnavailable>
              Map is temporarily unavailable. Destinations remain available in the list.
            </MapUnavailable>
          }
        >
          <TripMap {...props} mapStyle={mapStyle} />
        </MapErrorBoundary>
      )}
    </section>
  );
}

function MapLoading() {
  return (
    <div
      aria-label="Loading map"
      className="h-80 animate-pulse rounded-[var(--radius-md)] bg-[var(--muted)] sm:h-96"
      role="status"
    />
  );
}

function MapUnavailable({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div
      className="flex min-h-28 items-center justify-center rounded-[var(--radius-md)] border border-dashed border-[var(--border)] bg-[var(--surface-muted)] p-5 text-center text-sm text-[var(--muted-foreground)]"
      role="status"
    >
      {children}
    </div>
  );
}
