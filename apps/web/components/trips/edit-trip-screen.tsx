"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Card, CardContent, CardHeader, CardTitle } from "@tripforge/ui";
import type { UpdateTripRequest } from "@tripforge/contracts";

import { ApiClientError } from "@/lib/api/errors";
import { tripsApi } from "@/lib/api/trips";
import { tripKeys } from "@/lib/trips/query-keys";
import { tripFormSchema, type TripFormValues } from "@/lib/trips/schemas";

import { TripForm } from "./trip-form";

type EditTripScreenProps = Readonly<{ tripId: string }>;

function updateErrorMessage(error: unknown) {
  if (
    error instanceof ApiClientError &&
    error.code === "TRIP_DATE_CHANGE_WOULD_REMOVE_ITINERARY"
  ) {
    return "These dates would remove days that already contain plans. Move or delete those plans before changing the trip dates.";
  }

  if (
    error instanceof ApiClientError &&
    (error.code === "INVALID_TRIP_DATE_RANGE" || error.status === 400)
  ) {
    return "Check the trip name and dates, then try again.";
  }

  return "Unable to update trip. Please try again.";
}

function toUpdateRequest(values: TripFormValues): UpdateTripRequest {
  const parsed = tripFormSchema.parse(values);

  return {
    endsOn: parsed.endsOn || null,
    name: parsed.name,
    startsOn: parsed.startsOn || null,
  };
}

export function EditTripScreen({ tripId }: EditTripScreenProps) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [serverError, setServerError] = useState<string>();
  const tripQuery = useQuery({
    queryFn: ({ signal }) => tripsApi.get(tripId, { signal }),
    queryKey: tripKeys.detail(tripId),
  });
  const updateTrip = useMutation({
    mutationFn: (input: UpdateTripRequest) => tripsApi.update(tripId, input),
    onSuccess: async (trip) => {
      queryClient.setQueryData(tripKeys.detail(tripId), trip);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: tripKeys.lists() }),
        queryClient.invalidateQueries({ queryKey: tripKeys.days(tripId) }),
        queryClient.invalidateQueries({ queryKey: tripKeys.itinerary(tripId) }),
      ]);
      router.push("/trips");
    },
  });

  if (tripQuery.isPending) {
    return <TripFormSkeleton />;
  }

  if (tripQuery.error instanceof ApiClientError && tripQuery.error.status === 401) {
    return (
      <MessageCard title="Sign in to edit this trip.">
        <Link className="font-semibold text-[var(--primary)] hover:underline" href="/login">
          Sign in
        </Link>
      </MessageCard>
    );
  }

  if (tripQuery.error instanceof ApiClientError && tripQuery.error.status === 404) {
    return (
      <MessageCard title="Trip not found">
        <Link className="font-semibold text-[var(--primary)] hover:underline" href="/trips">
          Back to trips
        </Link>
      </MessageCard>
    );
  }

  if (tripQuery.isError) {
    return (
      <MessageCard title="Unable to load trip.">
        <Button variant="secondary" onClick={() => void tripQuery.refetch()}>
          Try again
        </Button>
      </MessageCard>
    );
  }

  if (tripQuery.data.accessRole === "viewer") {
    return (
      <MessageCard title="You have view-only access to this trip.">
        <div className="flex flex-wrap gap-3">
          <Link className="font-semibold text-[var(--primary)] hover:underline" href="/trips">
            Back to trips
          </Link>
          <Link
            className="font-semibold text-[var(--primary)] hover:underline"
            href={`/trips/${tripId}/members`}
          >
            Members
          </Link>
        </div>
      </MessageCard>
    );
  }

  async function submit(values: TripFormValues) {
    setServerError(undefined);

    try {
      await updateTrip.mutateAsync(toUpdateRequest(values));
    } catch (error) {
      setServerError(updateErrorMessage(error));
    }
  }

  return (
    <TripForm
      defaultValues={{
        endsOn: tripQuery.data.endsOn ?? "",
        name: tripQuery.data.name,
        startsOn: tripQuery.data.startsOn ?? "",
      }}
      isPending={updateTrip.isPending}
      onSubmit={submit}
      pendingLabel="Saving…"
      serverError={serverError}
      submitLabel="Save trip"
    />
  );
}

function TripFormSkeleton() {
  return (
    <div aria-label="Loading trip" className="space-y-5" role="status">
      <div className="h-20 animate-pulse rounded-[var(--radius-md)] bg-[var(--muted)]" />
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="h-20 animate-pulse rounded-[var(--radius-md)] bg-[var(--muted)]" />
        <div className="h-20 animate-pulse rounded-[var(--radius-md)] bg-[var(--muted)]" />
      </div>
    </div>
  );
}

function MessageCard({
  children,
  title,
}: Readonly<{ children: React.ReactNode; title: string }>) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
