"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
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
  focusItemId?: string;
  optimisticItems: ItineraryItem[];
  request: ReorderItineraryItemsRequest;
  successMessage?: string;
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
  const [moveAnnouncement, setMoveAnnouncement] = useState("");
  const [movingItem, setMovingItem] = useState<ItineraryItem>();
  const [pendingDelete, setPendingDelete] = useState<ItineraryItem>();
  const [localGroups, setLocalGroups] = useState<ItineraryGroups>();
  const addButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const dragSnapshot = useRef<ItineraryGroups | undefined>(undefined);
  const moveButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const moveInstructionsId = useId();
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
    onError: (_error, variables, context) => {
      if (context?.previousItems) {
        queryClient.setQueryData(itineraryKey, context.previousItems);
        if (daysQuery.data) {
          setLocalGroups(groupItineraryItems(daysQuery.data, context.previousItems));
        }
      }
      setMutationError("Unable to save the new itinerary order. Your changes were restored.");
      setMoveAnnouncement("The itinerary move could not be saved. The previous order was restored.");
      if (variables.focusItemId) {
        requestAnimationFrame(() => moveButtonRefs.current.get(variables.focusItemId!)?.focus());
      }
    },
    onSuccess: (items, variables) => {
      queryClient.setQueryData(itineraryKey, items);
      if (daysQuery.data) setLocalGroups(groupItineraryItems(daysQuery.data, items));
      if (variables.successMessage) setMoveAnnouncement(variables.successMessage);
      if (variables.focusItemId) {
        requestAnimationFrame(() => moveButtonRefs.current.get(variables.focusItemId!)?.focus());
      }
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
    const orderedItems = daysQuery.data
      ? flattenItineraryGroups(daysQuery.data, groups)
      : [];
    const deletedIndex = orderedItems.findIndex(({ id }) => id === item.id);
    const focusItem =
      orderedItems[deletedIndex + 1] ?? orderedItems[deletedIndex - 1];
    try {
      await deleteItem.mutateAsync(item.id);
      setPendingDelete(undefined);
      requestAnimationFrame(() => {
        if (focusItem) {
          moveButtonRefs.current.get(focusItem.id)?.focus();
        } else {
          addButtonRefs.current.get(item.dayId)?.focus();
        }
      });
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
      setMoveAnnouncement(canceled ? "Reordering cancelled." : "The item was not moved.");
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
      focusItemId: String(source.id),
      optimisticItems: flattenItineraryGroups(daysQuery.data, after),
      request,
      successMessage: `Dropped itinerary item in Day ${
        daysQuery.data.findIndex(({ id }) => id === targetDayId) + 1
      }, position ${source.index + 1}.`,
    });
  }

  function moveWithoutDragging(
    item: ItineraryItem,
    targetDayId: string,
    targetIndex: number,
  ) {
    if (!daysQuery.data) return;
    const sourceItems = groups[item.dayId] ?? [];
    const sourceIndex = sourceItems.findIndex(({ id }) => id === item.id);
    if (sourceIndex < 0) return;
    const after = moveItineraryItem(
      groups,
      item.dayId,
      sourceIndex,
      targetDayId,
      targetIndex,
    );
    const request = buildItineraryReorderRequest(groups, after);
    setMovingItem(undefined);
    if (request.days.length === 0) {
      requestAnimationFrame(() => moveButtonRefs.current.get(item.id)?.focus());
      return;
    }

    beginItineraryReorder(tripId);
    dragSnapshot.current = groups;
    setMutationError(undefined);
    setLocalGroups(after);
    const targetDayNumber =
      daysQuery.data.findIndex(({ id }) => id === targetDayId) + 1;
    reorderItems.mutate({
      focusItemId: item.id,
      optimisticItems: flattenItineraryGroups(daysQuery.data, after),
      request,
      successMessage: `Moved “${item.title}” to Day ${targetDayNumber}, position ${targetIndex + 1}.`,
    });
  }

  const isPending = daysQuery.isPending || destinationsQuery.isPending || itineraryQuery.isPending;
  const isError = daysQuery.isError || destinationsQuery.isError || itineraryQuery.isError;

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">Itinerary</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="sr-only" id={moveInstructionsId}>
          Press Space to pick up this item, use the arrow keys to choose a position, then press Space to drop. Use the adjacent Move button for a non-drag alternative.
        </p>
        <p aria-live="polite" className="sr-only">{moveAnnouncement}</p>
        {mutationError ? <Alert role="alert">{mutationError}</Alert> : null}
        {isPending ? (
          <div aria-label="Loading itinerary" className="grid gap-4 sm:grid-cols-2" role="status">
            <span className="sr-only">Loading itinerary…</span>
            <div aria-hidden="true" className="h-48 animate-pulse rounded-[var(--radius-md)] bg-[var(--muted)]" />
            <div aria-hidden="true" className="h-48 animate-pulse rounded-[var(--radius-md)] bg-[var(--muted)]" />
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
            onDragOver={({ operation }) => {
              if (!isSortableOperation(operation)) return;
              const source = operation.source;
              if (!source?.group) return;
              const dayNumber =
                daysQuery.data.findIndex(({ id }) => id === String(source.group)) + 1;
              if (dayNumber > 0) {
                setMoveAnnouncement(
                  `Moved to position ${source.index + 1} in Day ${dayNumber}.`,
                );
              }
            }}
            onDragStart={({ operation }) => {
              beginItineraryReorder(tripId);
              dragSnapshot.current = groups;
              setLocalGroups(groups);
              const itemId = String(operation.source?.id ?? "");
              const item = flattenItineraryGroups(daysQuery.data, groups).find(
                ({ id }) => id === itemId,
              );
              setMoveAnnouncement(
                item ? `Picked up “${item.title}”.` : "Picked up itinerary item.",
              );
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
                          ref={(element) => {
                            if (element) addButtonRefs.current.set(day.id, element);
                            else addButtonRefs.current.delete(day.id);
                          }}
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
                              moveActionRef={(element) => {
                                if (element) moveButtonRefs.current.set(item.id, element);
                                else moveButtonRefs.current.delete(item.id);
                              }}
                              moveInstructionsId={moveInstructionsId}
                              selected={
                                selectedMapPoint?.type === "itinerary" &&
                                selectedMapPoint.id === item.id
                              }
                              onDelete={setPendingDelete}
                              onEdit={(selected) => setActiveForm({ dayId: day.id, item: selected })}
                              onMove={setMovingItem}
                              onSelectPlace={(id) =>
                                onSelectMapPoint({ id, type: "itinerary" })
                              }
                            />
                            {movingItem?.id === item.id ? (
                              <MoveItineraryItem
                                days={daysQuery.data}
                                groups={groups}
                                item={item}
                                pending={reorderItems.isPending}
                                onCancel={() => {
                                  setMovingItem(undefined);
                                  requestAnimationFrame(() => moveButtonRefs.current.get(item.id)?.focus());
                                }}
                                onMove={(targetDayId, targetIndex) =>
                                  moveWithoutDragging(item, targetDayId, targetIndex)
                                }
                              />
                            ) : null}
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

function MoveItineraryItem({
  days,
  groups,
  item,
  onCancel,
  onMove,
  pending,
}: Readonly<{
  days: readonly TripDay[];
  groups: ItineraryGroups;
  item: ItineraryItem;
  onCancel: () => void;
  onMove: (targetDayId: string, targetIndex: number) => void;
  pending: boolean;
}>) {
  const id = useId();
  const daySelectRef = useRef<HTMLSelectElement>(null);
  const initialIndex = (groups[item.dayId] ?? []).findIndex(({ id: itemId }) => itemId === item.id);
  const [targetDayId, setTargetDayId] = useState(item.dayId);
  const [targetIndex, setTargetIndex] = useState(Math.max(0, initialIndex));
  const targetCount = (groups[targetDayId] ?? []).length;
  const positionCount = targetDayId === item.dayId ? targetCount : targetCount + 1;

  useEffect(() => {
    daySelectRef.current?.focus();
  }, []);

  return (
    <fieldset className="space-y-3 rounded-[var(--radius-md)] border border-[var(--primary)] bg-[var(--surface)] p-3">
      <legend className="px-1 text-sm font-semibold">
        Move “{item.title}” without dragging
      </legend>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor={`${id}-day`}>Target Day</Label>
          <select
            ref={daySelectRef}
            className={selectClasses}
            disabled={pending}
            id={`${id}-day`}
            value={targetDayId}
            onChange={(event) => {
              setTargetDayId(event.target.value);
              setTargetIndex(0);
            }}
          >
            {days.map((day, index) => (
              <option key={day.id} value={day.id}>
                Day {index + 1} · {formatCalendarDate(day.date)}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${id}-position`}>Target position</Label>
          <select
            className={selectClasses}
            disabled={pending}
            id={`${id}-position`}
            value={targetIndex}
            onChange={(event) => setTargetIndex(Number(event.target.value))}
          >
            {Array.from({ length: Math.max(positionCount, 1) }, (_, index) => (
              <option key={index} value={index}>
                Position {index + 1}
                {index === 0 && positionCount > 1 ? " (first)" : ""}
                {index === positionCount - 1 && positionCount > 1 ? " (last)" : ""}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <Button disabled={pending} size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          disabled={pending}
          size="sm"
          onClick={() => onMove(targetDayId, targetIndex)}
        >
          {pending ? "Moving…" : "Move item"}
        </Button>
      </div>
    </fieldset>
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
