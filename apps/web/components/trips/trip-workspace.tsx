"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button, Card, CardContent, CardHeader, CardTitle } from "@tripforge/ui";

import { ApiClientError } from "@/lib/api/errors";
import { tripsApi } from "@/lib/api/trips";
import { formatTripDates } from "@/lib/trips/calendar-date";
import { tripKeys } from "@/lib/trips/query-keys";
import type { TripMapSelection } from "@/lib/maps/trip-map-points";

import { DaysSection } from "./days-section";
import { DestinationsSection } from "./destinations-section";
import { RoutesSection } from "./routes-section";

type TripWorkspaceProps = Readonly<{ tripId: string }>;

export function TripWorkspace({ tripId }: TripWorkspaceProps) {
  const [selectedMapPoint, setSelectedMapPoint] = useState<TripMapSelection>();
  const [selectedRouteId, setSelectedRouteId] = useState<string>();
  const tripQuery = useQuery({
    queryFn: ({ signal }) => tripsApi.get(tripId, { signal }),
    queryKey: tripKeys.detail(tripId),
  });

  if (tripQuery.isPending) {
    return <WorkspaceSkeleton />;
  }

  if (tripQuery.error instanceof ApiClientError && tripQuery.error.status === 401) {
    return (
      <StateCard title="Sign in to open this trip.">
        <Link className={linkClasses} href="/login">Sign in</Link>
      </StateCard>
    );
  }

  if (tripQuery.error instanceof ApiClientError && tripQuery.error.status === 404) {
    return (
      <StateCard title="Trip not found">
        <Link className={linkClasses} href="/trips">Back to trips</Link>
      </StateCard>
    );
  }

  if (tripQuery.isError) {
    return (
      <StateCard title="Unable to load trip.">
        <Button variant="secondary" onClick={() => void tripQuery.refetch()}>
          Try again
        </Button>
      </StateCard>
    );
  }

  const trip = tripQuery.data;
  const canEdit = trip.accessRole !== "viewer";

  return (
    <div className="space-y-6">
      <header className="flex min-w-0 flex-col gap-4 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm sm:p-7 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <h1 className="min-w-0 break-words text-3xl font-bold">{trip.name}</h1>
            {trip.accessRole !== "owner" ? (
              <span className="rounded-full bg-[var(--surface-muted)] px-2.5 py-1 text-xs font-semibold capitalize text-[var(--muted-foreground)]">
                {trip.accessRole}
              </span>
            ) : null}
          </div>
          <p className="mt-2 text-[var(--muted-foreground)]">
            {formatTripDates(trip.startsOn, trip.endsOn)}
          </p>
        </div>
        <nav aria-label="Trip actions" className="flex flex-wrap gap-3">
          <Link className={linkClasses} href="/trips">All trips</Link>
          {canEdit ? <Link className={linkClasses} href={`/trips/${tripId}/edit`}>Edit</Link> : null}
          <Link className={linkClasses} href={`/trips/${tripId}/reservations`}>Reservations</Link>
          <Link className={linkClasses} href={`/trips/${tripId}/members`}>Members</Link>
        </nav>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.5fr)] lg:items-start">
        <DestinationsSection
          canEdit={canEdit}
          selectedMapPoint={selectedMapPoint}
          selectedRouteId={selectedRouteId}
          tripId={tripId}
          onSelectMapPoint={(selection) => {
            setSelectedMapPoint(selection);
            if (selection) setSelectedRouteId(undefined);
          }}
          onSelectRoute={(routeId) => {
            setSelectedRouteId(routeId);
            if (routeId) setSelectedMapPoint(undefined);
          }}
        />
        <DaysSection
          canEdit={canEdit}
          selectedMapPoint={selectedMapPoint}
          tripId={tripId}
          onSelectMapPoint={setSelectedMapPoint}
        />
      </div>
      <RoutesSection
        canEdit={canEdit}
        selectedRouteId={selectedRouteId}
        tripId={tripId}
        onSelectRoute={(routeId) => {
          setSelectedRouteId(routeId);
          if (routeId) setSelectedMapPoint(undefined);
        }}
      />
    </div>
  );
}

function WorkspaceSkeleton() {
  return (
    <div aria-label="Loading trip workspace" className="space-y-6" role="status">
      <div className="h-36 animate-pulse rounded-[var(--radius-lg)] bg-[var(--muted)]" />
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="h-72 animate-pulse rounded-[var(--radius-lg)] bg-[var(--muted)]" />
        <div className="h-72 animate-pulse rounded-[var(--radius-lg)] bg-[var(--muted)]" />
      </div>
    </div>
  );
}

function StateCard({ children, title }: Readonly<{ children: React.ReactNode; title: string }>) {
  return (
    <Card className="mx-auto max-w-2xl text-center">
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

const linkClasses = "font-semibold text-[var(--primary)] hover:underline";
