"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { TripDay } from "@tripforge/contracts";
import { Alert, Button, Card, CardContent, CardHeader, CardTitle, Label } from "@tripforge/ui";

import { tripsApi } from "@/lib/api/trips";
import { formatCalendarDate } from "@/lib/trips/calendar-date";
import { tripKeys } from "@/lib/trips/query-keys";

type DaysSectionProps = Readonly<{
  canEdit: boolean;
  tripId: string;
}>;

export function DaysSection({ canEdit, tripId }: DaysSectionProps) {
  const queryClient = useQueryClient();
  const [mutationError, setMutationError] = useState<string>();
  const daysKey = tripKeys.days(tripId);
  const daysQuery = useQuery({
    queryFn: ({ signal }) => tripsApi.listDays(tripId, { signal }),
    queryKey: daysKey,
  });
  const destinationsQuery = useQuery({
    queryFn: ({ signal }) => tripsApi.listDestinations(tripId, { signal }),
    queryKey: tripKeys.destinations(tripId),
  });
  const updateDay = useMutation({
    mutationFn: ({ dayId, destinationId }: { dayId: string; destinationId: string | null }) =>
      tripsApi.updateDay(tripId, dayId, { destinationId }),
    onSuccess: (updated) => {
      queryClient.setQueryData<TripDay[]>(daysKey, (days) =>
        days?.map((day) => (day.id === updated.id ? updated : day)),
      );
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

  const isPending = daysQuery.isPending || destinationsQuery.isPending;
  const isError = daysQuery.isError || destinationsQuery.isError;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Days</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {mutationError ? <Alert role="alert">{mutationError}</Alert> : null}
        {isPending ? (
          <div aria-label="Loading trip days" className="grid gap-4 sm:grid-cols-2" role="status">
            <div className="h-36 animate-pulse rounded-[var(--radius-md)] bg-[var(--muted)]" />
            <div className="h-36 animate-pulse rounded-[var(--radius-md)] bg-[var(--muted)]" />
          </div>
        ) : isError ? (
          <div className="space-y-3">
            <p>Unable to load trip days.</p>
            <Button
              variant="secondary"
              onClick={() => {
                void daysQuery.refetch();
                void destinationsQuery.refetch();
              }}
            >
              Try again
            </Button>
          </div>
        ) : daysQuery.data.length === 0 ? (
          canEdit ? (
            <div className="space-y-3">
              <p className="text-[var(--muted-foreground)]">
                Set both trip dates to build your day plan.
              </p>
              <Link className={linkClasses} href={`/trips/${tripId}/edit`}>Edit trip</Link>
            </div>
          ) : (
            <p className="text-[var(--muted-foreground)]">
              Trip dates have not been finalized yet.
            </p>
          )
        ) : (
          <ol className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {daysQuery.data.map((day, index) => {
              const destination = destinationsQuery.data.find(
                ({ id }) => id === day.destinationId,
              );
              const label = `Primary destination for Day ${index + 1}`;

              return (
                <li
                  className="min-w-0 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-muted)] p-4"
                  key={day.id}
                >
                  <p className="text-sm font-semibold text-[var(--muted-foreground)]">Day {index + 1}</p>
                  <p className="mt-1 text-lg font-bold">{formatCalendarDate(day.date)}</p>
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
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

const linkClasses = "font-semibold text-[var(--primary)] hover:underline";
const selectClasses =
  "min-h-11 w-full min-w-0 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[var(--foreground)] shadow-sm focus-visible:border-[var(--primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-50";
