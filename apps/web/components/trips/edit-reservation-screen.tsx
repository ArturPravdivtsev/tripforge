"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@tripforge/ui";

import { ApiClientError } from "@/lib/api/errors";
import { tripsApi } from "@/lib/api/trips";
import {
  reservationToFormValues,
  toUpdateReservationRequest,
} from "@/lib/trips/reservation-form-values";
import type { ReservationFormValues } from "@/lib/trips/reservation-schema";
import { tripKeys } from "@/lib/trips/query-keys";

import { reservationMutationError } from "./new-reservation-screen";
import { ReservationForm } from "./reservation-form";
import { ReservationScreenState } from "./reservation-screen-state";

type EditReservationScreenProps = Readonly<{
  reservationId: string;
  tripId: string;
}>;

export function EditReservationScreen({
  reservationId,
  tripId,
}: EditReservationScreenProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState<string>();
  const tripQuery = useQuery({
    queryFn: ({ signal }) => tripsApi.get(tripId, { signal }),
    queryKey: tripKeys.detail(tripId),
  });
  const reservationQuery = useQuery({
    queryFn: ({ signal }) =>
      tripsApi.getReservation(tripId, reservationId, { signal }),
    queryKey: tripKeys.reservation(tripId, reservationId),
  });
  const daysQuery = useQuery({
    queryFn: ({ signal }) => tripsApi.listDays(tripId, { signal }),
    queryKey: tripKeys.days(tripId),
  });
  const itemsQuery = useQuery({
    queryFn: ({ signal }) => tripsApi.listItineraryItems(tripId, { signal }),
    queryKey: tripKeys.itinerary(tripId),
  });
  const updateReservation = useMutation({
    mutationFn: (values: ReservationFormValues) =>
      tripsApi.updateReservation(
        tripId,
        reservationId,
        toUpdateReservationRequest(values),
      ),
    onSuccess: async (reservation) => {
      queryClient.setQueryData(
        tripKeys.reservation(tripId, reservationId),
        reservation,
      );
      await queryClient.invalidateQueries({
        exact: true,
        queryKey: tripKeys.reservations(tripId),
      });
      router.push(`/trips/${tripId}/reservations`);
    },
  });

  if (
    tripQuery.isPending ||
    reservationQuery.isPending ||
    daysQuery.isPending ||
    itemsQuery.isPending
  ) {
    return <ReservationScreenState loading title="Loading reservation…" />;
  }
  const queryError =
    tripQuery.error ?? reservationQuery.error ?? daysQuery.error ?? itemsQuery.error;
  if (queryError instanceof ApiClientError && queryError.status === 401) {
    return (
      <ReservationScreenState title="Sign in to edit this reservation.">
        <Link className={linkClasses} href="/login">Sign in</Link>
      </ReservationScreenState>
    );
  }
  if (queryError instanceof ApiClientError && queryError.status === 404) {
    return (
      <ReservationScreenState title="Reservation not found">
        <Link className={linkClasses} href={`/trips/${tripId}/reservations`}>
          Back to reservations
        </Link>
      </ReservationScreenState>
    );
  }
  if (
    queryError ||
    !tripQuery.data ||
    !reservationQuery.data ||
    !daysQuery.data ||
    !itemsQuery.data
  ) {
    return (
      <ReservationScreenState title="Unable to load reservation.">
        <Button variant="secondary" onClick={() => void reservationQuery.refetch()}>
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
      await updateReservation.mutateAsync(values);
    } catch (error) {
      setServerError(reservationMutationError(error));
    }
  }

  return (
    <ReservationForm
      cancelHref={`/trips/${tripId}/reservations`}
      days={daysQuery.data}
      defaultValues={reservationToFormValues(reservationQuery.data)}
      isPending={updateReservation.isPending}
      items={itemsQuery.data}
      onSubmit={submit}
      serverError={serverError}
      submitLabel="Save reservation"
    />
  );
}

const linkClasses = "font-semibold text-[var(--primary)] hover:underline";
