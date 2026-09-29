"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { TripsPage } from "@tripforge/contracts";
import { Alert, Button, Card, CardContent, CardHeader, CardTitle } from "@tripforge/ui";

import { ApiClientError } from "@/lib/api/errors";
import { tripsApi } from "@/lib/api/trips";
import { tripKeys } from "@/lib/trips/query-keys";

import { TripCard } from "./trip-card";
import { TripsPagination } from "./trips-pagination";

const PAGE_SIZE = 6;

type TripsDashboardProps = Readonly<{ page: number }>;

type DeleteContext = Readonly<{ previous?: TripsPage }>;

export function TripsDashboard({ page }: TripsDashboardProps) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [deleteError, setDeleteError] = useState<string>();
  const listKey = tripKeys.list(page, PAGE_SIZE);
  const tripsQuery = useQuery({
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) => tripsApi.list({ page, pageSize: PAGE_SIZE }, { signal }),
    queryKey: listKey,
  });
  const deleteTrip = useMutation<void, unknown, string, DeleteContext>({
    mutationFn: (tripId) => tripsApi.remove(tripId),
    onMutate: async (tripId) => {
      setDeleteError(undefined);
      await queryClient.cancelQueries({ exact: true, queryKey: listKey });
      const previous = queryClient.getQueryData<TripsPage>(listKey);

      if (previous) {
        const total = Math.max(0, previous.total - 1);
        queryClient.setQueryData<TripsPage>(listKey, {
          ...previous,
          items: previous.items.filter((trip) => trip.id !== tripId),
          total,
          totalPages: total === 0 ? 0 : Math.ceil(total / previous.pageSize),
        });
      }

      return { previous };
    },
    onError: (_error, _tripId, context) => {
      if (context?.previous) {
        queryClient.setQueryData(listKey, context.previous);
      }
      setDeleteError("Unable to delete trip. Please try again.");
    },
    onSuccess: (_data, tripId) => {
      queryClient.removeQueries({ queryKey: tripKeys.detail(tripId) });
      const current = queryClient.getQueryData<TripsPage>(listKey);

      if (page > 1 && current?.items.length === 0) {
        router.replace(`/trips?page=${page - 1}`);
      }
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: tripKeys.lists() });
    },
  });

  useEffect(() => {
    const data = tripsQuery.data;

    if (data && data.total > 0 && page > data.totalPages) {
      router.replace(`/trips?page=${data.totalPages}`);
    }
  }, [page, router, tripsQuery.data]);

  if (tripsQuery.isPending) {
    return <TripsLoading />;
  }

  if (tripsQuery.error instanceof ApiClientError && tripsQuery.error.status === 401) {
    return <AuthenticationRequired />;
  }

  if (tripsQuery.isError) {
    return (
      <StateCard title="Unable to load trips.">
        <Button variant="secondary" onClick={() => void tripsQuery.refetch()}>
          Try again
        </Button>
      </StateCard>
    );
  }

  if (tripsQuery.data.total === 0) {
    return (
      <StateCard title="No trips yet">
        <p className="text-[var(--muted-foreground)]">
          Start planning your first adventure.
        </p>
        <Link className={primaryLinkClasses} href="/trips/new">
          Create trip
        </Link>
      </StateCard>
    );
  }

  return (
    <div className="space-y-8">
      {deleteError ? <Alert role="alert">{deleteError}</Alert> : null}
      {tripsQuery.isFetching ? (
        <p aria-live="polite" className="text-sm text-[var(--muted-foreground)]">
          Updating…
        </p>
      ) : null}
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {tripsQuery.data.items.map((trip) => (
          <TripCard
            isDeleting={deleteTrip.isPending && deleteTrip.variables === trip.id}
            key={trip.id}
            onDelete={(tripId) => deleteTrip.mutate(tripId)}
            trip={trip}
          />
        ))}
      </div>
      <TripsPagination page={page} totalPages={tripsQuery.data.totalPages} />
    </div>
  );
}

const primaryLinkClasses =
  "inline-flex min-h-11 items-center justify-center rounded-[var(--radius-md)] bg-[var(--primary)] px-5 py-2.5 font-semibold text-[var(--primary-foreground)] shadow-sm transition hover:brightness-95";

function TripsLoading() {
  return (
    <div aria-label="Loading trips" className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3" role="status">
      <span className="sr-only">Loading trips…</span>
      {[0, 1, 2].map((item) => (
        <div
          aria-hidden="true"
          className="h-44 animate-pulse rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)]"
          key={item}
        />
      ))}
    </div>
  );
}

function AuthenticationRequired() {
  return (
    <StateCard title="Sign in to view your trips.">
      <div className="flex flex-wrap justify-center gap-3">
        <Link className={primaryLinkClasses} href="/login">
          Sign in
        </Link>
        <Link
          className="inline-flex min-h-11 items-center justify-center rounded-[var(--radius-md)] bg-[var(--surface-muted)] px-5 py-2.5 font-semibold"
          href="/register"
        >
          Create account
        </Link>
      </div>
    </StateCard>
  );
}

function StateCard({
  children,
  title,
}: Readonly<{ children: React.ReactNode; title: string }>) {
  return (
    <Card className="mx-auto max-w-2xl text-center">
      <CardHeader>
        <CardTitle as="h1">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}
