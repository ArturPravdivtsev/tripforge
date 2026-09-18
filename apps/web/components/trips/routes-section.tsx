"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ItineraryItem,
  TripDay,
  TripRouteMode,
  TripRouteSegment,
} from "@tripforge/contracts";
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Label,
} from "@tripforge/ui";

import { tripsApi } from "@/lib/api/trips";
import { tripKeys } from "@/lib/trips/query-keys";
import {
  formatRouteDistance,
  formatRouteDuration,
} from "@/lib/trips/route-format";

type RoutesSectionProps = Readonly<{
  canEdit: boolean;
  onSelectRoute?: (routeId?: string) => void;
  selectedRouteId?: string;
  tripId: string;
}>;

const modeLabels: Record<TripRouteMode, string> = {
  cycling: "Cycling",
  driving: "Driving",
  walking: "Walking",
};

export function RoutesSection({
  canEdit,
  onSelectRoute = () => undefined,
  selectedRouteId,
  tripId,
}: RoutesSectionProps) {
  const queryClient = useQueryClient();
  const [fromItemId, setFromItemId] = useState("");
  const [toItemId, setToItemId] = useState("");
  const [mode, setMode] = useState<TripRouteMode>("walking");
  const [confirmingDelete, setConfirmingDelete] = useState<string>();
  const [mutationError, setMutationError] = useState<string>();
  const routesKey = tripKeys.routes(tripId);
  const routesQuery = useQuery({
    queryFn: ({ signal }) => tripsApi.listRoutes(tripId, { signal }),
    queryKey: routesKey,
  });
  const itemsQuery = useQuery({
    queryFn: ({ signal }) => tripsApi.listItineraryItems(tripId, { signal }),
    queryKey: tripKeys.itinerary(tripId),
  });
  const daysQuery = useQuery({
    queryFn: ({ signal }) => tripsApi.listDays(tripId, { signal }),
    queryKey: tripKeys.days(tripId),
  });
  const locatedItems = useMemo(
    () => itemsQuery.data?.filter((item) => item.place) ?? [],
    [itemsQuery.data],
  );
  const labels = useMemo(
    () => buildEndpointLabels(daysQuery.data ?? [], locatedItems),
    [daysQuery.data, locatedItems],
  );
  const names = useMemo(
    () => new Map(locatedItems.map((item) => [item.id, item.place?.name ?? item.title])),
    [locatedItems],
  );

  const createRoute = useMutation({
    mutationFn: () =>
      tripsApi.createRoute(tripId, { fromItemId, mode, toItemId }),
    onSuccess: (route) => {
      queryClient.setQueryData<TripRouteSegment[]>(routesKey, (current = []) => [
        ...current,
        route,
      ]);
      setFromItemId("");
      setToItemId("");
      onSelectRoute(route.id);
    },
  });
  const updateRoute = useMutation({
    mutationFn: ({ id, nextMode }: { id: string; nextMode: TripRouteMode }) =>
      tripsApi.updateRoute(tripId, id, { mode: nextMode }),
    onSuccess: (route) => {
      queryClient.setQueryData<TripRouteSegment[]>(routesKey, (current) =>
        current?.map((entry) => (entry.id === route.id ? route : entry)),
      );
    },
  });
  const deleteRoute = useMutation({
    mutationFn: (id: string) => tripsApi.removeRoute(tripId, id),
    onSuccess: (_value, id) => {
      queryClient.setQueryData<TripRouteSegment[]>(routesKey, (current) =>
        current?.filter((route) => route.id !== id),
      );
      setConfirmingDelete(undefined);
      if (selectedRouteId === id) onSelectRoute(undefined);
    },
  });

  async function calculate() {
    if (!fromItemId || !toItemId || fromItemId === toItemId) {
      setMutationError("Choose two different itinerary places.");
      return;
    }
    setMutationError(undefined);
    try {
      await createRoute.mutateAsync();
    } catch {
      setMutationError("Could not calculate this route right now. Please try again.");
    }
  }

  async function recalculate(route: TripRouteSegment) {
    await updateMode(route.id, route.mode);
  }

  async function updateMode(id: string, nextMode: TripRouteMode) {
    setMutationError(undefined);
    try {
      await updateRoute.mutateAsync({ id, nextMode });
    } catch {
      setMutationError("Could not calculate this route right now. Please try again.");
    }
  }

  async function remove(id: string) {
    setMutationError(undefined);
    try {
      await deleteRoute.mutateAsync(id);
    } catch {
      setMutationError("Unable to delete this route. Please try again.");
    }
  }

  const pending = createRoute.isPending || updateRoute.isPending || deleteRoute.isPending;

  return (
    <Card>
      <CardHeader><CardTitle>Routes</CardTitle></CardHeader>
      <CardContent className="space-y-5">
        {mutationError ? <Alert role="alert">{mutationError}</Alert> : null}
        {routesQuery.isPending || itemsQuery.isPending || daysQuery.isPending ? (
          <div aria-label="Loading routes" className="h-24 animate-pulse rounded-[var(--radius-md)] bg-[var(--muted)]" role="status" />
        ) : routesQuery.isError || itemsQuery.isError || daysQuery.isError ? (
          <div className="space-y-3">
            <p>Unable to load routes.</p>
            <Button variant="secondary" onClick={() => void routesQuery.refetch()}>Try again</Button>
          </div>
        ) : (
          <>
            {routesQuery.data.length === 0 ? (
              <p className="text-[var(--muted-foreground)]">No saved routes yet.</p>
            ) : (
              <ul className="space-y-3">
                {routesQuery.data.map((route) => (
                  <li
                    className={`rounded-[var(--radius-md)] border p-4 ${selectedRouteId === route.id ? "border-[var(--primary)] bg-[var(--surface-muted)]" : "border-[var(--border)]"}`}
                    key={route.id}
                  >
                    <button className="w-full min-w-0 text-left" onClick={() => onSelectRoute(route.id)} type="button">
                      <span className="block truncate font-semibold">
                        {names.get(route.fromItemId) ?? "Unknown place"} → {names.get(route.toItemId) ?? "Unknown place"}
                      </span>
                      <span className="mt-1 block text-sm text-[var(--muted-foreground)]">
                        {modeLabels[route.mode]} · {formatRouteDistance(route.distanceMeters)} · {formatRouteDuration(route.durationSeconds)}
                      </span>
                    </button>
                    {canEdit ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <select
                          aria-label={`Mode for route from ${labels.get(route.fromItemId) ?? "unknown place"} to ${labels.get(route.toItemId) ?? "unknown place"}`}
                          className={selectClasses}
                          disabled={pending}
                          value={route.mode}
                          onChange={(event) => void updateMode(route.id, event.target.value as TripRouteMode)}
                        >
                          {Object.entries(modeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                        </select>
                        <Button disabled={pending} size="sm" variant="secondary" onClick={() => void recalculate(route)}>
                          {updateRoute.isPending ? "Calculating route…" : "Recalculate"}
                        </Button>
                        {confirmingDelete === route.id ? (
                          <>
                            <Button className="bg-[var(--danger)] text-[var(--danger-foreground)]" disabled={pending} size="sm" onClick={() => void remove(route.id)}>Confirm delete</Button>
                            <Button disabled={pending} size="sm" variant="secondary" onClick={() => setConfirmingDelete(undefined)}>Cancel</Button>
                          </>
                        ) : (
                          <Button className="bg-[var(--danger)] text-[var(--danger-foreground)]" disabled={pending} size="sm" onClick={() => setConfirmingDelete(route.id)}>Delete</Button>
                        )}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}

            {canEdit ? (
              <form className="grid gap-3 border-t border-[var(--border)] pt-5 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); void calculate(); }}>
                <RouteSelect id="route-from" label="From" items={locatedItems} labels={labels} value={fromItemId} onChange={setFromItemId} />
                <RouteSelect id="route-to" label="To" items={locatedItems} labels={labels} value={toItemId} onChange={setToItemId} />
                <div className="space-y-2">
                  <Label htmlFor="route-mode">Mode</Label>
                  <select className={selectClasses} id="route-mode" value={mode} onChange={(event) => setMode(event.target.value as TripRouteMode)}>
                    {Object.entries(modeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </div>
                <div className="flex items-end">
                  <Button className="w-full" disabled={pending || locatedItems.length < 2} type="submit">
                    {createRoute.isPending ? "Calculating route…" : "Calculate route"}
                  </Button>
                </div>
              </form>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function RouteSelect({ id, items, label, labels, onChange, value }: Readonly<{
  id: string;
  items: readonly ItineraryItem[];
  label: string;
  labels: ReadonlyMap<string, string>;
  onChange: (value: string) => void;
  value: string;
}>) {
  return (
    <div className="min-w-0 space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <select className={`${selectClasses} truncate`} id={id} value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">Choose a place</option>
        {items.map((item) => <option key={item.id} value={item.id}>{labels.get(item.id)}</option>)}
      </select>
    </div>
  );
}

function buildEndpointLabels(days: readonly TripDay[], items: readonly ItineraryItem[]) {
  const dayNumbers = new Map(days.map((day, index) => [day.id, index + 1]));
  return new Map(items.map((item) => [
    item.id,
    `Day ${dayNumbers.get(item.dayId) ?? "?"}${item.startTime ? ` · ${item.startTime}` : ""} · ${item.place?.name ?? item.title}`,
  ]));
}

const selectClasses = "min-h-10 w-full min-w-0 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm";
