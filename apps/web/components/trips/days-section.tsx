"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { DragDropProvider, type DragEndEvent } from "@dnd-kit/react";
import { isSortableOperation, useSortable } from "@dnd-kit/react/sortable";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreateItineraryItemRequest,
  ItineraryItem,
  ReorderItineraryItemsRequest,
  TripDay,
  UpdateItineraryItemRequest,
} from "@tripforge/contracts";
import { Alert, Button, Card, CardContent, CardHeader, CardTitle, Label } from "@tripforge/ui";

import { ItineraryItemCard } from "@/components/trips/itinerary-item-card";
import { ItineraryItemForm } from "@/components/trips/itinerary-item-form";
import { tripsApi } from "@/lib/api/trips";
import type { TripMapSelection } from "@/lib/maps/trip-map-points";
import {
  beginItineraryReorder,
  endItineraryReorder,
} from "@/lib/realtime/itinerary-invalidation";
import { formatCalendarDate } from "@/lib/trips/calendar-date";
import {
  buildItineraryReorderRequest,
  flattenItineraryGroups,
  groupItineraryItems,
  moveItineraryItem,
  type ItineraryGroups,
} from "@/lib/trips/itinerary-state";
import { tripKeys } from "@/lib/trips/query-keys";
import type { ItineraryItemFormValues } from "@/lib/trips/schemas";

type DaysSectionProps = Readonly<{
  canEdit: boolean;
  tripId: string;
  onSelectMapPoint?: (selection?: TripMapSelection) => void;
  selectedMapPoint?: TripMapSelection;
}>;

type ReorderVariables = Readonly<{
  optimisticItems: ItineraryItem[];
  request: ReorderItineraryItemsRequest;
}>;

const emptyItemValues: ItineraryItemFormValues = {
  kind: "activity",
  notes: "",
  place: null,
  startTime: "",
  title: "",
};

export function DaysSection({
  canEdit,
  onSelectMapPoint = () => undefined,
  selectedMapPoint,
  tripId,
}: DaysSectionProps) {
  const queryClient = useQueryClient();
  const [activeForm, setActiveForm] = useState<
    { dayId: string; item?: ItineraryItem } | undefined
  >();
  const [mutationError, setMutationError] = useState<string>();
  const [pendingDelete, setPendingDelete] = useState<ItineraryItem>();
  const [localGroups, setLocalGroups] = useState<ItineraryGroups>();
  const dragSnapshot = useRef<ItineraryGroups | undefined>(undefined);
  const daysKey = tripKeys.days(tripId);
  const itineraryKey = tripKeys.itinerary(tripId);

  const daysQuery = useQuery({
    queryFn: ({ signal }) => tripsApi.listDays(tripId, { signal }),
    queryKey: daysKey,
  });
  const destinationsQuery = useQuery({
    queryFn: ({ signal }) => tripsApi.listDestinations(tripId, { signal }),
    queryKey: tripKeys.destinations(tripId),
  });
  const itineraryQuery = useQuery({
    queryFn: ({ signal }) => tripsApi.listItineraryItems(tripId, { signal }),
    queryKey: itineraryKey,
  });

  const groups =
    localGroups ??
    groupItineraryItems(daysQuery.data ?? [], itineraryQuery.data ?? []);

  useEffect(
    () => () => {
      endItineraryReorder(tripId);
    },
    [tripId],
  );

  const updateDay = useMutation({
    mutationFn: ({ dayId, destinationId }: { dayId: string; destinationId: string | null }) =>
      tripsApi.updateDay(tripId, dayId, { destinationId }),
    onSuccess: (updated) => {
      queryClient.setQueryData<TripDay[]>(daysKey, (days) =>
        days?.map((day) => (day.id === updated.id ? updated : day)),
      );
    },
  });
  const saveItem = useMutation({
    mutationFn: async ({
      dayId,
      input,
      itemId,
    }: {
      dayId: string;
      input: CreateItineraryItemRequest | UpdateItineraryItemRequest;
      itemId?: string;
    }) =>
      itemId
        ? tripsApi.updateItineraryItem(tripId, itemId, input)
        : tripsApi.createItineraryItem(tripId, {
            ...input,
            dayId,
          } as CreateItineraryItemRequest),
    onSuccess: async () => {
      setActiveForm(undefined);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: itineraryKey }),
        queryClient.invalidateQueries({ queryKey: tripKeys.routes(tripId) }),
      ]);
    },
  });
  const deleteItem = useMutation({
    mutationFn: (itemId: string) => tripsApi.removeItineraryItem(tripId, itemId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: itineraryKey }),
        queryClient.invalidateQueries({ queryKey: tripKeys.routes(tripId) }),
      ]);
    },
  });
  const reorderItems = useMutation({
    mutationFn: ({ request }: ReorderVariables) => tripsApi.reorderItineraryItems(tripId, request),
    onMutate: async ({ optimisticItems }) => {
      await queryClient.cancelQueries({ queryKey: itineraryKey });
      const previousItems = queryClient.getQueryData<ItineraryItem[]>(itineraryKey);
      queryClient.setQueryData(itineraryKey, optimisticItems);
      return { previousItems };
    },
    onError: (_error, _variables, context) => {
      if (context?.previousItems) {
        queryClient.setQueryData(itineraryKey, context.previousItems);
        if (daysQuery.data) {
          setLocalGroups(groupItineraryItems(daysQuery.data, context.previousItems));
        }
      }
      setMutationError("Unable to save the new itinerary order. Your changes were restored.");
    },
    onSuccess: (items) => {
      queryClient.setQueryData(itineraryKey, items);
      if (daysQuery.data) setLocalGroups(groupItineraryItems(daysQuery.data, items));
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: itineraryKey });
      setLocalGroups(undefined);
      endItineraryReorder(tripId);
    },
  });

  async function assignDestination(dayId: string, destinationId: string | null) {
    setMutationError(undefined);
    try {
      await updateDay.mutateAsync({ dayId, destinationId });
    } catch {
      setMutationError("Unable to update the Day destination. Please try again.");
    }
  }

  async function submitItem(dayId: string, item: ItineraryItem | undefined, values: ItineraryItemFormValues) {
    setMutationError(undefined);
    try {
      await saveItem.mutateAsync({
        dayId,
        input: {
          kind: values.kind,
          notes: values.notes.trim() || null,
          place: values.place,
          startTime: values.startTime || null,
          title: values.title.trim(),
        },
        itemId: item?.id,
      });
    } catch {
      setMutationError(`Unable to ${item ? "update" : "add"} the itinerary item. Please try again.`);
    }
  }

  async function removeItem(item: ItineraryItem) {
    setMutationError(undefined);
    try {
      await deleteItem.mutateAsync(item.id);
      setPendingDelete(undefined);
    } catch {
      setMutationError("Unable to delete the itinerary item. Please try again.");
    }
  }

  function handleDragEnd({ canceled, operation }: DragEndEvent) {
    if (
      canceled ||
      !daysQuery.data ||
      !operation.source ||
      !isSortableOperation(operation)
    ) {
      setLocalGroups(undefined);
      endItineraryReorder(tripId);
      return;
    }

    const { source } = operation;
    const sourceDayId = String(source.initialGroup ?? "");
    const targetDayId = String(source.group ?? "");
    const before = dragSnapshot.current ?? groups;
    if (!sourceDayId || !targetDayId) {
      setLocalGroups(undefined);
      endItineraryReorder(tripId);
      return;
    }

    const after = moveItineraryItem(
      before,
      sourceDayId,
      source.initialIndex,
      targetDayId,
      source.index,
    );
    const request = buildItineraryReorderRequest(before, after);
    if (request.days.length === 0) {
      setLocalGroups(undefined);
      endItineraryReorder(tripId);
      return;
    }

    setMutationError(undefined);
    setLocalGroups(after);
    reorderItems.mutate({
      optimisticItems: flattenItineraryGroups(daysQuery.data, after),
      request,
    });
  }

  const isPending = daysQuery.isPending || destinationsQuery.isPending || itineraryQuery.isPending;
  const isError = daysQuery.isError || destinationsQuery.isError || itineraryQuery.isError;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Itinerary</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {mutationError ? <Alert role="alert">{mutationError}</Alert> : null}
        {isPending ? (
          <div aria-label="Loading itinerary" className="grid gap-4 sm:grid-cols-2" role="status">
            <div className="h-48 animate-pulse rounded-[var(--radius-md)] bg-[var(--muted)]" />
            <div className="h-48 animate-pulse rounded-[var(--radius-md)] bg-[var(--muted)]" />
          </div>
        ) : isError ? (
          <div className="space-y-3">
            <p>Unable to load the itinerary.</p>
            <Button
              variant="secondary"
              onClick={() => {
                void daysQuery.refetch();
                void destinationsQuery.refetch();
                void itineraryQuery.refetch();
              }}
            >
              Try again
            </Button>
          </div>
        ) : daysQuery.data.length === 0 ? (
          canEdit ? (
            <div className="space-y-3">
              <p className="text-[var(--muted-foreground)]">
                Set both trip dates to build your itinerary.
              </p>
              <Link className={linkClasses} href={`/trips/${tripId}/edit`}>Edit trip</Link>
            </div>
          ) : (
            <p className="text-[var(--muted-foreground)]">
              Trip dates have not been finalized yet.
            </p>
          )
        ) : (
          <DragDropProvider
            onDragEnd={handleDragEnd}
            onDragStart={() => {
              beginItineraryReorder(tripId);
              dragSnapshot.current = groups;
              setLocalGroups(groups);
            }}
          >
            <ol className="grid items-start gap-4 lg:grid-cols-2">
              {daysQuery.data.map((day, index) => {
                const destination = destinationsQuery.data.find(
                  ({ id }) => id === day.destinationId,
                );
                const label = `Primary destination for Day ${index + 1}`;
                const dayItems = groups[day.id] ?? [];
                const form = activeForm?.dayId === day.id ? activeForm : undefined;
                const proximity =
                  destination?.latitude === null || destination?.longitude === null
                    ? undefined
                    : destination
                      ? {
                          latitude: destination.latitude,
                          longitude: destination.longitude,
                        }
                      : undefined;

                return (
                  <li
                    className="min-w-0 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-muted)] p-4"
                    key={day.id}
                  >
                    <div className="flex min-w-0 items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[var(--muted-foreground)]">Day {index + 1}</p>
                        <p className="mt-1 text-lg font-bold">{formatCalendarDate(day.date)}</p>
                      </div>
                      {canEdit ? (
                        <Button
                          aria-label={`Add item to Day ${index + 1}`}
                          className="shrink-0"
                          size="sm"
                          variant="secondary"
                          onClick={() => setActiveForm({ dayId: day.id })}
                        >
                          + Add item
                        </Button>
                      ) : null}
                    </div>

                    {canEdit ? (
                      <div className="mt-4 space-y-2">
                        <Label htmlFor={`day-destination-${day.id}`}>{label}</Label>
                        <select
                          id={`day-destination-${day.id}`}
                          className={selectClasses}
                          disabled={updateDay.isPending && updateDay.variables?.dayId === day.id}
                          value={day.destinationId ?? ""}
                          onChange={(event) =>
                            void assignDestination(day.id, event.target.value || null)
                          }
                        >
                          <option value="">Not assigned</option>
                          {destinationsQuery.data.map(({ id, name }) => (
                            <option key={id} value={id}>{name}</option>
                          ))}
                        </select>
                      </div>
                    ) : (
                      <p className="mt-4 break-words text-sm">
                        <span className="text-[var(--muted-foreground)]">Primary destination: </span>
                        {destination?.name ?? "Not assigned"}
                      </p>
                    )}

                    <div className="mt-4 space-y-3">
                      {dayItems.map((item, itemIndex) =>
                        form?.item?.id === item.id ? (
                          <ItineraryItemForm
                            key={item.id}
                            defaultValues={toFormValues(item)}
                            isPending={saveItem.isPending}
                            proximity={proximity}
                            serverError={mutationError}
                            submitLabel="Save item"
                            onCancel={() => setActiveForm(undefined)}
                            onSubmit={(values) => submitItem(day.id, item, values)}
                          />
                        ) : (
                          <div className="space-y-2" key={item.id}>
                            <ItineraryItemCard
                              canEdit={canEdit}
                              dayId={day.id}
                              index={itemIndex}
                              item={item}
                              selected={
                                selectedMapPoint?.type === "itinerary" &&
                                selectedMapPoint.id === item.id
                              }
                              onDelete={setPendingDelete}
                              onEdit={(selected) => setActiveForm({ dayId: day.id, item: selected })}
                              onSelectPlace={(id) =>
                                onSelectMapPoint({ id, type: "itinerary" })
                              }
                            />
                            {pendingDelete?.id === item.id ? (
                              <div
                                aria-label={`Confirm deletion of ${item.title}`}
                                className="rounded-[var(--radius-md)] border border-[var(--danger)] bg-[var(--surface)] p-3"
                                role="group"
                              >
                                <p className="text-sm font-semibold">Delete “{item.title}”?</p>
                                <div className="mt-3 flex justify-end gap-2">
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => setPendingDelete(undefined)}
                                  >
                                    Cancel
                                  </Button>
                                  <Button
                                    className="bg-[var(--danger)]"
                                    disabled={deleteItem.isPending}
                                    size="sm"
                                    onClick={() => void removeItem(item)}
                                  >
                                    {deleteItem.isPending ? "Deleting…" : "Delete"}
                                  </Button>
                                </div>
                              </div>
                            ) : null}
                          </div>
                        ),
                      )}
                      {dayItems.length === 0 ? (
                        <p className="text-sm text-[var(--muted-foreground)]">No plans yet.</p>
                      ) : null}
                      {canEdit ? <DayDropZone dayId={day.id} index={dayItems.length} /> : null}
                      {form && !form.item ? (
                        <ItineraryItemForm
                          defaultValues={emptyItemValues}
                          isPending={saveItem.isPending}
                          proximity={proximity}
                          serverError={mutationError}
                          submitLabel="Add item"
                          onCancel={() => setActiveForm(undefined)}
                          onSubmit={(values) => submitItem(day.id, undefined, values)}
                        />
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ol>
          </DragDropProvider>
        )}
      </CardContent>
    </Card>
  );
}

function DayDropZone({ dayId, index }: Readonly<{ dayId: string; index: number }>) {
  const { isDropTarget, ref } = useSortable({
    accept: "itinerary-item",
    disabled: { draggable: true, droppable: false },
    group: dayId,
    id: `day-drop-zone:${dayId}`,
    index,
    type: "itinerary-item",
  });

  return (
    <div
      ref={ref}
      aria-hidden="true"
      className={`min-h-10 rounded-[var(--radius-md)] border border-dashed px-3 py-2 text-center text-sm text-[var(--muted-foreground)] transition ${
        isDropTarget ? "border-[var(--primary)] bg-[var(--surface)]" : "border-[var(--border)]"
      }`}
    >
      Drop item here
    </div>
  );
}

function toFormValues(item: ItineraryItem): ItineraryItemFormValues {
  return {
    kind: item.kind,
    notes: item.notes ?? "",
    place: item.place,
    startTime: item.startTime ?? "",
    title: item.title,
  };
}

const linkClasses = "font-semibold text-[var(--primary)] hover:underline";
const selectClasses =
  "min-h-11 w-full min-w-0 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[var(--foreground)] shadow-sm focus-visible:border-[var(--primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-50";
