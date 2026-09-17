"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { setWorkerUrl } from "maplibre-gl";
import Map, {
  Marker,
  NavigationControl,
  Popup,
  type MapMouseEvent,
  type MapRef,
} from "react-map-gl/maplibre";
import type { TripDestination } from "@tripforge/contracts";
import { Button } from "@tripforge/ui";

import { calculateBounds, hasCoordinates, type MapPoint } from "@/lib/maps/bounds";
import { DEFAULT_MAP_VIEW } from "@/lib/maps/config";

setWorkerUrl(
  new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).toString(),
);

const SINGLE_DESTINATION_ZOOM = 10;

type TripMapProps = Readonly<{
  canEdit: boolean;
  destinations: readonly TripDestination[];
  editingDestinationId?: string;
  mapStyle: string;
  onEditLocation: (destinationId: string) => void;
  onMapClick: (point: MapPoint) => void;
  onSelectDestination: (destinationId?: string) => void;
  preview?: MapPoint;
  selectedDestinationId?: string;
}>;

export function TripMap({
  canEdit,
  destinations,
  editingDestinationId,
  mapStyle,
  onEditLocation,
  onMapClick,
  onSelectDestination,
  preview,
  selectedDestinationId,
}: TripMapProps) {
  const mapRef = useRef<MapRef>(null);
  const lastAutoFitSignature = useRef<string | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  const located = useMemo(() => destinations.filter(hasCoordinates), [destinations]);
  const coordinateSignature = located
    .map(({ id, latitude, longitude }) => `${id}:${latitude}:${longitude}`)
    .join("|");

  const fitDestinations = useCallback(() => {
    const map = mapRef.current;
    if (!map || located.length === 0) return;

    if (located.length === 1) {
      map.easeTo({
        center: [located[0]!.longitude, located[0]!.latitude],
        duration: 500,
        zoom: SINGLE_DESTINATION_ZOOM,
      });
      return;
    }

    const bounds = calculateBounds(located);
    if (!bounds) return;
    map.fitBounds(
      [
        [bounds.west, bounds.south],
        [bounds.east, bounds.north],
      ],
      { duration: 500, maxZoom: 12, padding: 48 },
    );
  }, [located]);

  useEffect(() => {
    if (lastAutoFitSignature.current === coordinateSignature) return;
    lastAutoFitSignature.current = coordinateSignature;
    fitDestinations();
  }, [coordinateSignature, fitDestinations]);

  const selected = located.find(({ id }) => id === selectedDestinationId);
  const selectedLatitude = selected?.latitude;
  const selectedLongitude = selected?.longitude;

  useEffect(() => {
    if (selectedLatitude === undefined || selectedLongitude === undefined) return;
    mapRef.current?.easeTo({
      center: [selectedLongitude, selectedLatitude],
      duration: 400,
      zoom: Math.max(mapRef.current.getZoom(), SINGLE_DESTINATION_ZOOM),
    });
  }, [selectedDestinationId, selectedLatitude, selectedLongitude]);

  if (failed) {
    return <MapFailure />;
  }

  return (
    <div className="relative h-80 overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] sm:h-96">
      <Map
        cooperativeGestures
        dragRotate={false}
        initialViewState={DEFAULT_MAP_VIEW}
        mapStyle={mapStyle}
        onClick={(event: MapMouseEvent) => {
          if (!editingDestinationId) return;
          onMapClick({
            latitude: event.lngLat.lat,
            longitude: event.lngLat.lng,
          });
        }}
        onError={() => setFailed(true)}
        onLoad={fitDestinations}
        pitchWithRotate={false}
        ref={mapRef}
        touchPitch={false}
      >
        <NavigationControl position="top-right" showCompass={false} />
        {located.map((destination) => (
          <Marker
            anchor="bottom"
            key={destination.id}
            latitude={destination.latitude}
            longitude={destination.longitude}
          >
            <button
              aria-label={`Select ${destination.name} on map`}
              className={`min-h-8 rounded-full border-2 px-2 py-1 text-xs font-bold shadow-md ${
                destination.id === selectedDestinationId
                  ? "border-[var(--foreground)] bg-[var(--primary)] text-[var(--primary-foreground)]"
                  : "border-white bg-[var(--surface)] text-[var(--foreground)]"
              }`}
              onClick={(event) => {
                event.stopPropagation();
                onSelectDestination(destination.id);
              }}
              type="button"
            >
              {destination.position + 1}. {destination.name}
            </button>
          </Marker>
        ))}
        {editingDestinationId && preview ? (
          <Marker anchor="bottom" latitude={preview.latitude} longitude={preview.longitude}>
            <span
              aria-label="Location preview"
              className="block size-6 rounded-full border-4 border-white bg-[var(--danger)] shadow-lg"
              role="img"
            />
          </Marker>
        ) : null}
        {selected ? (
          <Popup
            anchor="bottom"
            closeOnClick={false}
            latitude={selected.latitude}
            longitude={selected.longitude}
            offset={36}
            onClose={() => onSelectDestination(undefined)}
          >
            <div className="space-y-2 text-[var(--foreground)]">
              <p className="font-semibold">{selected.name}</p>
              <p className="text-xs">Destination {selected.position + 1}</p>
              {canEdit ? (
                <Button size="sm" variant="secondary" onClick={() => onEditLocation(selected.id)}>
                  Edit location
                </Button>
              ) : null}
            </div>
          </Popup>
        ) : null}
      </Map>
      {located.length > 0 ? (
        <Button
          className="absolute bottom-3 left-3 shadow-md"
          size="sm"
          variant="secondary"
          onClick={fitDestinations}
        >
          Show all destinations
        </Button>
      ) : null}
      {editingDestinationId ? (
        <p className="absolute bottom-3 right-3 max-w-56 rounded-[var(--radius-sm)] bg-[var(--surface)] px-3 py-2 text-xs shadow-md">
          Select a point on the map, then save it below.
        </p>
      ) : null}
    </div>
  );
}

export function MapFailure() {
  return (
    <div
      className="flex h-52 items-center justify-center rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-muted)] p-5 text-center text-sm text-[var(--muted-foreground)]"
      role="status"
    >
      Map is temporarily unavailable. Destinations remain available in the list.
    </div>
  );
}
