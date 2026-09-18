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
import { Button } from "@tripforge/ui";

import { calculateBounds, type MapPoint } from "@/lib/maps/bounds";
import { DEFAULT_MAP_VIEW } from "@/lib/maps/config";
import type {
  TripMapPoint,
  TripMapSelection,
} from "@/lib/maps/trip-map-points";

setWorkerUrl(
  new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).toString(),
);

const SINGLE_DESTINATION_ZOOM = 10;

type TripMapProps = Readonly<{
  canEdit: boolean;
  editingDestinationId?: string;
  mapStyle: string;
  onEditLocation: (destinationId: string) => void;
  onMapClick: (point: MapPoint) => void;
  onSelectMapPoint: (selection?: TripMapSelection) => void;
  points: readonly TripMapPoint[];
  preview?: MapPoint;
  selectedMapPoint?: TripMapSelection;
}>;

export function TripMap({
  canEdit,
  editingDestinationId,
  mapStyle,
  onEditLocation,
  onMapClick,
  onSelectMapPoint,
  points,
  preview,
  selectedMapPoint,
}: TripMapProps) {
  const mapRef = useRef<MapRef>(null);
  const lastAutoFitSignature = useRef<string | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  const located = useMemo(() => points, [points]);
  const coordinateSignature = located
    .map(({ id, latitude, longitude, type }) => `${type}:${id}:${latitude}:${longitude}`)
    .join("|");

  const fitPlaces = useCallback(() => {
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
    fitPlaces();
  }, [coordinateSignature, fitPlaces]);

  const selected = located.find(
    ({ id, type }) => id === selectedMapPoint?.id && type === selectedMapPoint.type,
  );
  const selectedLatitude = selected?.latitude;
  const selectedLongitude = selected?.longitude;

  useEffect(() => {
    if (selectedLatitude === undefined || selectedLongitude === undefined) return;
    mapRef.current?.easeTo({
      center: [selectedLongitude, selectedLatitude],
      duration: 400,
      zoom: Math.max(mapRef.current.getZoom(), SINGLE_DESTINATION_ZOOM),
    });
  }, [selectedMapPoint, selectedLatitude, selectedLongitude]);

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
        onLoad={fitPlaces}
        pitchWithRotate={false}
        ref={mapRef}
        touchPitch={false}
      >
        <NavigationControl position="top-right" showCompass={false} />
        {located.map((point) => (
          <Marker
            anchor="bottom"
            key={`${point.type}:${point.id}`}
            latitude={point.latitude}
            longitude={point.longitude}
          >
            <button
              aria-label={`Select ${point.label} on map`}
              className={`${
                point.type === "destination"
                  ? "min-h-8 px-2 py-1 text-xs font-bold"
                  : "size-6 text-[10px] font-semibold"
              } rounded-full border-2 shadow-md ${
                point.id === selectedMapPoint?.id && point.type === selectedMapPoint.type
                  ? "border-[var(--foreground)] bg-[var(--primary)] text-[var(--primary-foreground)]"
                  : point.type === "destination"
                    ? "border-white bg-[var(--surface)] text-[var(--foreground)]"
                    : "border-white bg-[var(--danger)] text-white"
              }`}
              onClick={(event) => {
                event.stopPropagation();
                onSelectMapPoint({ id: point.id, type: point.type });
              }}
              type="button"
            >
              {point.type === "destination" ? `${point.position + 1}. ${point.label}` : "•"}
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
            onClose={() => onSelectMapPoint(undefined)}
          >
            <div className="space-y-2 text-[var(--foreground)]">
              <p className="font-semibold">{selected.label}</p>
              {selected.type === "destination" ? (
                <p className="text-xs">Destination {selected.position + 1}</p>
              ) : (
                <>
                  <p className="text-xs">
                    Day {selected.dayNumber}
                    {selected.startTime ? ` · ${selected.startTime}` : ""}
                    {` · ${kindLabels[selected.kind]}`}
                  </p>
                  {selected.address ? (
                    <p className="max-w-56 text-xs">{selected.address}</p>
                  ) : null}
                </>
              )}
              {canEdit && selected.type === "destination" ? (
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
          onClick={fitPlaces}
        >
          Show all places
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
      Map is temporarily unavailable. Trip places remain available in the lists.
    </div>
  );
}

const kindLabels = {
  accommodation: "Accommodation",
  activity: "Activity",
  food: "Food",
  other: "Other",
  transport: "Transport",
} as const;
