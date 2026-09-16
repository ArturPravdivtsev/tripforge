"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { TripDestination } from "@tripforge/contracts";
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
} from "@tripforge/ui";

import { tripsApi } from "@/lib/api/trips";
import { tripKeys } from "@/lib/trips/query-keys";

type DestinationsSectionProps = Readonly<{
  canEdit: boolean;
  tripId: string;
}>;

function validateName(value: string): string | undefined {
  const name = value.trim();

  if (!name) return "Enter a destination name.";
  if (name.length > 160) return "Destination name must be 160 characters or fewer.";
  return undefined;
}

export function DestinationsSection({
  canEdit,
  tripId,
}: DestinationsSectionProps) {
  const queryClient = useQueryClient();
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string>();
  const [editingName, setEditingName] = useState("");
  const [confirmingId, setConfirmingId] = useState<string>();
  const [formError, setFormError] = useState<string>();
  const [mutationError, setMutationError] = useState<string>();
  const key = tripKeys.destinations(tripId);
  const destinationsQuery = useQuery({
    queryFn: ({ signal }) => tripsApi.listDestinations(tripId, { signal }),
    queryKey: key,
  });
  const refresh = () =>
    queryClient.invalidateQueries({ exact: true, queryKey: key });
  const createDestination = useMutation({
    mutationFn: (name: string) => tripsApi.createDestination(tripId, { name }),
    onSuccess: refresh,
  });
  const updateDestination = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      tripsApi.updateDestination(tripId, id, { name }),
    onSuccess: async () => {
      setEditingId(undefined);
      await refresh();
    },
  });
  const deleteDestination = useMutation({
    mutationFn: (id: string) => tripsApi.removeDestination(tripId, id),
    onSuccess: async () => {
      setConfirmingId(undefined);
      await Promise.all([
        refresh(),
        queryClient.invalidateQueries({
          exact: true,
          queryKey: tripKeys.days(tripId),
        }),
      ]);
    },
  });
  const reorderDestinations = useMutation({
    mutationFn: (destinationIds: string[]) =>
      tripsApi.reorderDestinations(tripId, { destinationIds }),
    onSuccess: (destinations) => queryClient.setQueryData(key, destinations),
  });

  function safeMutationError() {
    setMutationError("Unable to update destinations. Please try again.");
  }

  async function addDestination() {
    const error = validateName(newName);
    setFormError(error);
    setMutationError(undefined);
    if (error) return;

    try {
      await createDestination.mutateAsync(newName.trim());
      setNewName("");
    } catch {
      safeMutationError();
    }
  }

  async function saveDestination(id: string) {
    const error = validateName(editingName);
    setFormError(error);
    setMutationError(undefined);
    if (error) return;

    try {
      await updateDestination.mutateAsync({ id, name: editingName.trim() });
    } catch {
      safeMutationError();
    }
  }

  async function removeDestination(id: string) {
    setMutationError(undefined);
    try {
      await deleteDestination.mutateAsync(id);
    } catch {
      safeMutationError();
    }
  }

  async function moveDestination(index: number, offset: -1 | 1) {
    if (!destinationsQuery.data) return;
    const reordered = [...destinationsQuery.data];
    const target = index + offset;
    [reordered[index], reordered[target]] = [reordered[target]!, reordered[index]!];
    setMutationError(undefined);
    try {
      await reorderDestinations.mutateAsync(reordered.map(({ id }) => id));
    } catch {
      safeMutationError();
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Destinations</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {mutationError ? <Alert role="alert">{mutationError}</Alert> : null}
        {destinationsQuery.isPending ? (
          <div aria-label="Loading destinations" className="space-y-3" role="status">
            <div className="h-14 animate-pulse rounded-[var(--radius-md)] bg-[var(--muted)]" />
            <div className="h-14 animate-pulse rounded-[var(--radius-md)] bg-[var(--muted)]" />
          </div>
        ) : destinationsQuery.isError ? (
          <div className="space-y-3">
            <p>Unable to load destinations.</p>
            <Button variant="secondary" onClick={() => void destinationsQuery.refetch()}>
              Try again
            </Button>
          </div>
        ) : (
          <>
            {destinationsQuery.data.length === 0 ? (
              <p className="text-[var(--muted-foreground)]">
                {canEdit
                  ? "Add the places you plan to visit."
                  : "No destinations have been added yet."}
              </p>
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {destinationsQuery.data.map((destination, index) => (
                  <DestinationRow
                    canEdit={canEdit}
                    confirming={confirmingId === destination.id}
                    destination={destination}
                    editing={editingId === destination.id}
                    editingName={editingName}
                    formError={editingId === destination.id ? formError : undefined}
                    isFirst={index === 0}
                    isLast={index === destinationsQuery.data.length - 1}
                    isPending={
                      createDestination.isPending ||
                      updateDestination.isPending ||
                      deleteDestination.isPending ||
                      reorderDestinations.isPending
                    }
                    key={destination.id}
                    onCancelDelete={() => setConfirmingId(undefined)}
                    onCancelEdit={() => {
                      setEditingId(undefined);
                      setFormError(undefined);
                    }}
                    onChangeName={setEditingName}
                    onConfirmDelete={() => void removeDestination(destination.id)}
                    onDelete={() => setConfirmingId(destination.id)}
                    onEdit={() => {
                      setEditingId(destination.id);
                      setEditingName(destination.name);
                      setFormError(undefined);
                    }}
                    onMove={(offset) => void moveDestination(index, offset)}
                    onSave={() => void saveDestination(destination.id)}
                  />
                ))}
              </ul>
            )}

            {canEdit ? (
              <form
                className="space-y-3 border-t border-[var(--border)] pt-5"
                onSubmit={(event) => {
                  event.preventDefault();
                  void addDestination();
                }}
              >
                <Label htmlFor="new-destination">Destination name</Label>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <Input
                    id="new-destination"
                    value={newName}
                    disabled={createDestination.isPending}
                    aria-invalid={Boolean(formError)}
                    onChange={(event) => setNewName(event.target.value)}
                  />
                  <Button type="submit" disabled={createDestination.isPending}>
                    {createDestination.isPending ? "Adding…" : "Add destination"}
                  </Button>
                </div>
                {formError ? <p className="text-sm text-[var(--danger)]">{formError}</p> : null}
              </form>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function DestinationRow({
  canEdit,
  confirming,
  destination,
  editing,
  editingName,
  formError,
  isFirst,
  isLast,
  isPending,
  onCancelDelete,
  onCancelEdit,
  onChangeName,
  onConfirmDelete,
  onDelete,
  onEdit,
  onMove,
  onSave,
}: Readonly<{
  canEdit: boolean;
  confirming: boolean;
  destination: TripDestination;
  editing: boolean;
  editingName: string;
  formError?: string;
  isFirst: boolean;
  isLast: boolean;
  isPending: boolean;
  onCancelDelete: () => void;
  onCancelEdit: () => void;
  onChangeName: (name: string) => void;
  onConfirmDelete: () => void;
  onDelete: () => void;
  onEdit: () => void;
  onMove: (offset: -1 | 1) => void;
  onSave: () => void;
}>) {
  return (
    <li className="min-w-0 py-4 first:pt-0 last:pb-0">
      {editing ? (
        <div className="space-y-3">
          <Label htmlFor={`destination-${destination.id}`}>Destination name</Label>
          <Input
            id={`destination-${destination.id}`}
            value={editingName}
            disabled={isPending}
            aria-invalid={Boolean(formError)}
            onChange={(event) => onChangeName(event.target.value)}
          />
          {formError ? <p className="text-sm text-[var(--danger)]">{formError}</p> : null}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={isPending} onClick={onSave}>Save</Button>
            <Button size="sm" variant="secondary" disabled={isPending} onClick={onCancelEdit}>
              Cancel
            </Button>
          </div>
        </div>
      ) : confirming ? (
        <div className="space-y-3">
          <p className="break-words font-semibold">Delete “{destination.name}”?</p>
          <p className="text-sm text-[var(--muted-foreground)]">
            Days assigned to it will become unassigned.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={isPending} onClick={onConfirmDelete}>
              {isPending ? "Deleting…" : "Confirm delete"}
            </Button>
            <Button size="sm" variant="secondary" disabled={isPending} onClick={onCancelDelete}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="min-w-0 break-words font-semibold">{destination.name}</p>
          {canEdit ? (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" disabled={isFirst || isPending} onClick={() => onMove(-1)}>
                Move up
              </Button>
              <Button size="sm" variant="secondary" disabled={isLast || isPending} onClick={() => onMove(1)}>
                Move down
              </Button>
              <Button size="sm" variant="ghost" disabled={isPending} onClick={onEdit}>Edit</Button>
              <Button size="sm" variant="ghost" disabled={isPending} onClick={onDelete}>Delete</Button>
            </div>
          ) : null}
        </div>
      )}
    </li>
  );
}
