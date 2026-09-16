"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { CreateTripRequest } from "@tripforge/contracts";

import { tripsApi } from "@/lib/api/trips";
import { ApiClientError } from "@/lib/api/errors";
import { tripKeys } from "@/lib/trips/query-keys";
import { tripFormSchema, type TripFormValues } from "@/lib/trips/schemas";

import { TripForm } from "./trip-form";

function createErrorMessage(error: unknown) {
  if (
    error instanceof ApiClientError &&
    (error.code === "INVALID_TRIP_DATE_RANGE" || error.status === 400)
  ) {
    return "Check the trip name and dates, then try again.";
  }

  return "Unable to create trip. Please try again.";
}

function toCreateRequest(values: TripFormValues): CreateTripRequest {
  const parsed = tripFormSchema.parse(values);

  return {
    endsOn: parsed.endsOn || null,
    name: parsed.name,
    startsOn: parsed.startsOn || null,
  };
}

export function CreateTripForm() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [serverError, setServerError] = useState<string>();
  const createTrip = useMutation({
    mutationFn: (input: CreateTripRequest) => tripsApi.create(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: tripKeys.lists() });
      router.push("/trips");
    },
  });

  async function submit(values: TripFormValues) {
    setServerError(undefined);

    try {
      await createTrip.mutateAsync(toCreateRequest(values));
    } catch (error) {
      setServerError(createErrorMessage(error));
    }
  }

  return (
    <TripForm
      defaultValues={{ endsOn: "", name: "", startsOn: "" }}
      isPending={createTrip.isPending}
      onSubmit={submit}
      pendingLabel="Creating…"
      serverError={serverError}
      submitLabel="Create trip"
    />
  );
}
