"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@tripforge/ui";

import { ApiClientError } from "@/lib/api/errors";
import { tripsApi } from "@/lib/api/trips";
import {
  emptyReservationForm,
  toCreateReservationRequest,
} from "@/lib/trips/reservation-form-values";
import type { ReservationFormValues } from "@/lib/trips/reservation-schema";
import { tripKeys } from "@/lib/trips/query-keys";

import { ReservationForm } from "./reservation-form";
import { ReservationScreenState } from "./reservation-screen-state";

export function NewReservationScreen({ tripId }: Readonly<{ tripId: string }>) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState<string>();
  const tripQuery = useQuery({
    queryFn: ({ signal }) => tripsApi.get(tripId, { signal }),
    queryKey: tripKeys.detail(tripId),
  });
  const daysQuery = useQuery({
    queryFn: ({ signal }) => tripsApi.listDays(tripId, { signal }),
    queryKey: tripKeys.days(tripId),
  });
  const itemsQuery = useQuery({
    queryFn: ({ signal }) => tripsApi.listItineraryItems(tripId, { signal }),
    queryKey: tripKeys.itinerary(tripId),
  });
  const createReservation = useMutation({
    mutationFn: (values: ReservationFormValues) =>
      tripsApi.createReservation(tripId, toCreateReservationRequest(values)),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        exact: true,
        queryKey: tripKeys.reservations(tripId),
      });
      router.push(`/trips/${tripId}/reservations`);
    },
  });

  if (tripQuery.isPending || daysQuery.isPending || itemsQuery.isPending) {
    return <ReservationScreenState loading title="Loading reservation form…" />;
  }
  const queryError = tripQuery.error ?? daysQuery.error ?? itemsQuery.error;
  if (queryError instanceof ApiClientError && queryError.status === 401) {
    return (
      <ReservationScreenState title="Sign in to create a reservation.">
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
  if (queryError || !tripQuery.data || !daysQuery.data || !itemsQuery.data) {
    return (
      <ReservationScreenState title="Unable to load the reservation form.">
        <Button variant="secondary" onClick={() => void tripQuery.refetch()}>
          Try again
        </Button>
      </ReservationScreenState>
    );
  }
  if (tripQuery.data.accessRole === "viewer") {
    return (
      <ReservationScreenState title="You have view-only access to this trip.">
        <Link className={linkClasses} href={`/trips/${tripId}/reservations`}>
          Back to reservations
        </Link>
      </ReservationScreenState>
    );
  }

  async function submit(values: ReservationFormValues) {
    setServerError(undefined);
    try {
      await createReservation.mutateAsync(values);
    } catch (error) {
      setServerError(reservationMutationError(error));
    }
  }

  return (
    <ReservationForm
      cancelHref={`/trips/${tripId}/reservations`}
      days={daysQuery.data}
      defaultValues={emptyReservationForm(tripQuery.data.startsOn ?? "")}
      isPending={createReservation.isPending}
      items={itemsQuery.data}
      onSubmit={submit}
      serverError={serverError}
      submitLabel="Create reservation"
    />
  );
}

export function reservationMutationError(error: unknown) {
  if (
    error instanceof ApiClientError &&
    [
      "INVALID_RESERVATION_DETAILS",
      "INVALID_RESERVATION_SCHEDULE",
      "ITINERARY_ITEM_NOT_FOUND",
    ].includes(error.code)
  ) {
    return "Check the reservation details and schedule, then try again.";
  }
  return "Unable to save reservation. Please try again.";
}

const linkClasses = "font-semibold text-[var(--primary)] hover:underline";
