"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Trip, TripReservation } from "@tripforge/contracts";
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@tripforge/ui";

import { ApiClientError } from "@/lib/api/errors";
import { tripsApi } from "@/lib/api/trips";
import { tripKeys } from "@/lib/trips/query-keys";

import { ReservationScreenState } from "./reservation-screen-state";

export function ReservationsScreen({ tripId }: Readonly<{ tripId: string }>) {
  const queryClient = useQueryClient();
  const [mutationError, setMutationError] = useState<string>();
  const tripQuery = useQuery({
    queryFn: ({ signal }) => tripsApi.get(tripId, { signal }),
    queryKey: tripKeys.detail(tripId),
  });
  const reservationsQuery = useQuery({
    queryFn: ({ signal }) => tripsApi.listReservations(tripId, { signal }),
    queryKey: tripKeys.reservations(tripId),
  });
  const cancelReservation = useMutation({
    mutationFn: (reservationId: string) =>
      tripsApi.updateReservation(tripId, reservationId, { status: "cancelled" }),
    onSuccess: async (reservation) => {
      queryClient.setQueryData(
        tripKeys.reservation(tripId, reservation.id),
        reservation,
      );
      await queryClient.invalidateQueries({
        exact: true,
        queryKey: tripKeys.reservations(tripId),
      });
    },
  });
  const deleteReservation = useMutation({
    mutationFn: (reservationId: string) =>
      tripsApi.removeReservation(tripId, reservationId),
    onSuccess: async (_data, reservationId) => {
      queryClient.removeQueries({
        queryKey: tripKeys.reservation(tripId, reservationId),
      });
      await queryClient.invalidateQueries({
        exact: true,
        queryKey: tripKeys.reservations(tripId),
      });
    },
  });

  if (tripQuery.isPending || reservationsQuery.isPending) {
    return <ReservationScreenState loading title="Loading reservations…" />;
  }
  const queryError = tripQuery.error ?? reservationsQuery.error;
  if (queryError instanceof ApiClientError && queryError.status === 401) {
    return (
      <ReservationScreenState title="Sign in to view reservations.">
        <Link className={linkClasses} href="/login">Sign in</Link>
      </ReservationScreenState>
    );
  }
  if (queryError instanceof ApiClientError && queryError.status === 404) {
    return (
      <ReservationScreenState title="Trip not found">
        <Link className={linkClasses} href="/trips">Back to trips</Link>
      </ReservationScreenState>
    );
  }
  if (queryError || !tripQuery.data || !reservationsQuery.data) {
    return (
      <ReservationScreenState title="Unable to load reservations.">
        <Button variant="secondary" onClick={() => void reservationsQuery.refetch()}>
          Try again
        </Button>
      </ReservationScreenState>
    );
  }

  const canEdit = tripQuery.data.accessRole !== "viewer";

  async function cancel(reservation: TripReservation) {
    if (
      !window.confirm(
        `Mark “${reservation.title}” as cancelled? This only updates TripForge and does not contact the provider.`,
      )
    ) {
      return;
    }
    setMutationError(undefined);
    try {
      await cancelReservation.mutateAsync(reservation.id);
    } catch {
      setMutationError("Unable to update reservation. Please try again.");
    }
  }

  async function remove(reservation: TripReservation) {
    if (
      !window.confirm(
        `Delete reservation “${reservation.title}”? This removes the TripForge record and does not cancel the provider booking.`,
      )
    ) {
      return;
    }
    setMutationError(undefined);
    try {
      await deleteReservation.mutateAsync(reservation.id);
    } catch {
      setMutationError("Unable to delete reservation. Please try again.");
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="break-words text-3xl font-bold">Reservations</h1>
          <p className="mt-2 text-[var(--muted-foreground)]">
            Structured booking records for {tripQuery.data.name}.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link className={secondaryLinkClasses} href={`/trips/${tripId}`}>
            Trip workspace
          </Link>
          {canEdit ? (
            <Link className={primaryLinkClasses} href={`/trips/${tripId}/reservations/new`}>
              New reservation
            </Link>
          ) : null}
        </div>
      </header>

      {mutationError ? <Alert role="alert">{mutationError}</Alert> : null}
      {reservationsQuery.data.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-[var(--muted-foreground)]">
            No reservations yet.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {reservationsQuery.data.map((reservation) => (
            <ReservationCard
              canEdit={canEdit}
              key={reservation.id}
              pending={
                (cancelReservation.isPending || deleteReservation.isPending) &&
                (cancelReservation.variables === reservation.id ||
                  deleteReservation.variables === reservation.id)
              }
              reservation={reservation}
              trip={tripQuery.data}
              onCancel={() => void cancel(reservation)}
              onDelete={() => void remove(reservation)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ReservationCard({
  canEdit,
  onCancel,
  onDelete,
  pending,
  reservation,
  trip,
}: Readonly<{
  canEdit: boolean;
  onCancel: () => void;
  onDelete: () => void;
  pending: boolean;
  reservation: TripReservation;
  trip: Trip;
}>) {
  return (
    <Card className={reservation.status === "cancelled" ? "opacity-70" : undefined}>
      <CardHeader>
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
              {KIND_LABELS[reservation.kind]}
            </p>
            <CardTitle className="mt-1 break-words">{reservation.title}</CardTitle>
          </div>
          <span className={statusClasses(reservation.status)}>
            {STATUS_LABELS[reservation.status]}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1 text-sm">
          <p>{formatSchedule(reservation)}</p>
          {outsideTripDates(reservation, trip) ? (
            <p className="font-medium text-amber-700">Outside trip dates</p>
          ) : null}
          {reservation.transport ? (
            <div className="min-w-0 rounded-[var(--radius-md)] bg-[var(--surface-muted)] p-3">
              <p className="break-words font-semibold">
                {reservation.transport.originName} → {reservation.transport.destinationName}
              </p>
              <p className="break-words text-[var(--muted-foreground)]">
                {[reservation.transport.operatorName, reservation.transport.serviceNumber]
                  .filter(Boolean)
                  .join(" · ") || "Transport details"}
              </p>
            </div>
          ) : null}
          {reservation.providerName ? <p>Provider: {reservation.providerName}</p> : null}
          {reservation.confirmationCode ? (
            <p className="break-all">Confirmation: {reservation.confirmationCode}</p>
          ) : null}
          {reservation.locationName ? <p>Location: {reservation.locationName}</p> : null}
          <p className="text-[var(--muted-foreground)]">
            {reservation.itineraryItemId
              ? "Linked to itinerary"
              : "Not linked to itinerary"}
          </p>
          {reservation.notes ? <p className="whitespace-pre-wrap break-words">{reservation.notes}</p> : null}
        </div>

        {canEdit ? (
          <div className="flex flex-wrap gap-2 border-t border-[var(--border)] pt-4">
            <Link
              className={secondaryLinkClasses}
              href={`/trips/${trip.id}/reservations/${reservation.id}/edit`}
            >
              Edit
            </Link>
            {reservation.status !== "cancelled" ? (
              <Button type="button" disabled={pending} variant="secondary" onClick={onCancel}>
                Cancel booking
              </Button>
            ) : null}
            <Button
              type="button"
              className="text-[var(--danger)]"
              disabled={pending}
              variant="ghost"
              onClick={onDelete}
            >
              Delete record
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function formatSchedule(reservation: TripReservation) {
  const start = `${reservation.startDate}${reservation.startTime ? ` · ${reservation.startTime}` : ""}`;
  if (!reservation.endDate) return start;
  const end = `${reservation.endDate}${reservation.endTime ? ` · ${reservation.endTime}` : ""}`;
  return `${start} → ${end}`;
}

function outsideTripDates(reservation: TripReservation, trip: Trip) {
  return Boolean(
    (trip.startsOn && reservation.startDate < trip.startsOn) ||
      (trip.endsOn && (reservation.endDate ?? reservation.startDate) > trip.endsOn),
  );
}

function statusClasses(status: TripReservation["status"]) {
  const color =
    status === "confirmed"
      ? "bg-emerald-100 text-emerald-800"
      : status === "cancelled"
        ? "bg-[var(--surface-muted)] text-[var(--muted-foreground)]"
        : "bg-amber-100 text-amber-800";
  return `rounded-full px-2.5 py-1 text-xs font-semibold ${color}`;
}

const KIND_LABELS = {
  accommodation: "Accommodation",
  activity: "Activity",
  other: "Other",
  restaurant: "Restaurant",
  transport: "Transport",
} as const;
const STATUS_LABELS = {
  cancelled: "Cancelled",
  confirmed: "Confirmed",
  pending: "Pending",
} as const;
const linkClasses = "font-semibold text-[var(--primary)] hover:underline";
const primaryLinkClasses =
  "inline-flex min-h-11 items-center justify-center rounded-[var(--radius-md)] bg-[var(--primary)] px-4 py-2 font-semibold text-[var(--primary-foreground)]";
const secondaryLinkClasses =
  "inline-flex min-h-11 items-center justify-center rounded-[var(--radius-md)] bg-[var(--surface-muted)] px-4 py-2 font-semibold hover:bg-[var(--muted)]";
