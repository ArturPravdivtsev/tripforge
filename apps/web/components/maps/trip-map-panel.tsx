"use client";

import dynamic from "next/dynamic";
import type { ItineraryItem, TripDay, TripDestination } from "@tripforge/contracts";

import type { MapPoint } from "@/lib/maps/bounds";
import { getMapTilerStyleUrl } from "@/lib/maps/config";
import {
  buildTripMapPoints,
  type TripMapSelection,
} from "@/lib/maps/trip-map-points";

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
  itineraryItems: readonly ItineraryItem[];
  days: readonly TripDay[];
  onEditLocation: (destinationId: string) => void;
  onMapClick: (point: MapPoint) => void;
  onSelectMapPoint: (selection?: TripMapSelection) => void;
  preview?: MapPoint;
  selectedMapPoint?: TripMapSelection;
}>;

export function TripMapPanel(props: TripMapPanelProps) {
  const mapStyle = getMapTilerStyleUrl();
  const points = buildTripMapPoints(
    props.destinations,
    props.days,
    props.itineraryItems,
  );

  return (
    <section aria-labelledby="trip-map-heading" className="space-y-3 border-t border-[var(--border)] pt-5">
      <div>
        <h3 className="font-semibold" id="trip-map-heading">Map</h3>
        <p className="text-sm text-[var(--muted-foreground)]">
          Destination and itinerary locations supplement the accessible lists.
        </p>
      </div>
      {!mapStyle ? (
        <MapUnavailable>
          Map is unavailable because the MapTiler browser key is not configured.
        </MapUnavailable>
      ) : points.length === 0 && !props.editingDestinationId ? (
        <MapUnavailable>
          {props.canEdit
            ? "Add a destination location or itinerary place to show it on the map."
            : "No trip locations have been added yet."}
        </MapUnavailable>
      ) : (
        <MapErrorBoundary
          fallback={
            <MapUnavailable>
              Map is temporarily unavailable. Destinations remain available in the list.
            </MapUnavailable>
          }
        >
          <TripMap {...props} mapStyle={mapStyle} points={points} />
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
