"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  TRIP_SEARCH_RESULT_TYPES,
  type TripSearchResult,
  type TripSearchResultType,
} from "@tripforge/contracts";
import { Button, Card, CardContent, Input, Label } from "@tripforge/ui";

import { ApiClientError } from "@/lib/api/errors";
import { tripsApi } from "@/lib/api/trips";
import { useDebouncedValue } from "@/lib/places/use-debounced-value";
import { tripKeys } from "@/lib/trips/query-keys";
import { searchTargetHref } from "@/lib/trips/search-target";

type SearchFilter = "all" | TripSearchResultType;

const FILTER_LABELS: Record<SearchFilter, string> = {
  all: "All",
  destination: "Destinations",
  itinerary: "Itinerary",
  reservation: "Reservations",
  expense: "Expenses",
  document: "Documents",
};

const TYPE_LABELS: Record<TripSearchResultType, string> = {
  destination: "Destination",
  itinerary: "Itinerary",
  reservation: "Reservation",
  expense: "Expense",
  document: "Document",
};

export function TripSearchScreen({ tripId }: Readonly<{ tripId: string }>) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<SearchFilter>("all");
  const debouncedQuery = useDebouncedValue(query, 250);
  const normalizedQuery = debouncedQuery.trim();
  const typeKey = filter === "all" ? "all" : filter;
  const selectedTypes = filter === "all" ? undefined : [filter] as const;
  const tripQuery = useQuery({
    queryFn: ({ signal }) => tripsApi.get(tripId, { signal }),
    queryKey: tripKeys.detail(tripId),
  });
  const searchQuery = useQuery({
    enabled: tripQuery.isSuccess && normalizedQuery.length >= 2,
    queryFn: ({ signal }) =>
      tripsApi.search(
        tripId,
        { q: normalizedQuery, types: selectedTypes },
        { signal },
      ),
    queryKey: tripKeys.search(tripId, normalizedQuery, typeKey),
    staleTime: 30_000,
  });

  if (tripQuery.isPending) {
    return <SearchState title="Loading trip search…" />;
  }

  if (tripQuery.error instanceof ApiClientError && tripQuery.error.status === 401) {
    return (
      <SearchState title="Sign in to search this trip.">
        <Link className={linkClasses} href="/login">Sign in</Link>
      </SearchState>
    );
  }

  if (tripQuery.error instanceof ApiClientError && tripQuery.error.status === 404) {
    return (
      <SearchState title="Trip not found">
        <Link className={linkClasses} href="/trips">Back to trips</Link>
      </SearchState>
    );
  }

  if (tripQuery.isError) {
    return (
      <SearchState title="Unable to load trip search.">
        <Button variant="secondary" onClick={() => void tripQuery.refetch()}>
          Try again
        </Button>
      </SearchState>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="break-words text-3xl font-bold">Search</h1>
          <p className="mt-2 break-words text-[var(--muted-foreground)]">
            Find plans, bookings, costs, and files in {tripQuery.data.name}.
          </p>
        </div>
        <Link className={linkClasses} href={`/trips/${tripId}`}>
          Trip workspace
        </Link>
      </header>

      <Card>
        <CardContent className="space-y-4 py-5">
          <div className="space-y-2">
            <Label htmlFor="trip-search">Search this trip</Label>
            <Input
              autoComplete="off"
              id="trip-search"
              maxLength={100}
              placeholder="Try a place, booking, expense, or document"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <div aria-label="Search result type" className="flex flex-wrap gap-2" role="group">
            {(["all", ...TRIP_SEARCH_RESULT_TYPES] as const).map((value) => (
              <Button
                aria-pressed={filter === value}
                key={value}
                size="sm"
                type="button"
                variant={filter === value ? "default" : "secondary"}
                onClick={() => setFilter(value)}
              >
                {FILTER_LABELS[value]}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      <SearchResults
        currentQuery={query.trim()}
        error={searchQuery.error}
        loading={
          searchQuery.isFetching ||
          (query.trim().length >= 2 && query.trim() !== normalizedQuery)
        }
        results={searchQuery.data?.results}
        onRetry={() => void searchQuery.refetch()}
      />
    </div>
  );
}

function SearchResults({
  currentQuery,
  error,
  loading,
  onRetry,
  results,
}: Readonly<{
  currentQuery: string;
  error: Error | null;
  loading: boolean;
  onRetry: () => void;
  results: TripSearchResult[] | undefined;
}>) {
  if (currentQuery.length < 2) {
    return <SearchMessage>Type at least 2 characters to search this trip.</SearchMessage>;
  }

  if (error) {
    return (
      <SearchMessage>
        <span>Could not search this trip.</span>{" "}
        <Button size="sm" variant="secondary" onClick={onRetry}>Try again</Button>
      </SearchMessage>
    );
  }

  if (loading && !results) {
    return <SearchMessage>Searching…</SearchMessage>;
  }

  if (results?.length === 0) {
    return <SearchMessage>No matches found.</SearchMessage>;
  }

  return (
    <section aria-label="Search results" className="space-y-3">
      <p aria-live="polite" className="text-sm text-[var(--muted-foreground)]" role="status">
        {loading ? "Updating results…" : `${results?.length ?? 0} results`}
      </p>
      <ul className="space-y-3">
        {results?.map((result) => (
          <li key={`${result.type}:${result.id}`}>
            <Link
              className="block min-w-0 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm transition hover:border-[var(--primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
              href={searchTargetHref(result.target)}
            >
              <span className="text-xs font-semibold uppercase tracking-wide text-[var(--primary)]">
                {TYPE_LABELS[result.type]}
              </span>
              <span className="mt-1 block min-w-0 break-words font-semibold">
                {result.title}
              </span>
              <span className="mt-1 block min-w-0 break-words text-sm text-[var(--muted-foreground)]">
                {result.subtitle}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function SearchMessage({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <Card>
      <CardContent aria-live="polite" className="py-10 text-center text-[var(--muted-foreground)]" role="status">
        {children}
      </CardContent>
    </Card>
  );
}

function SearchState({ children, title }: Readonly<{ children?: React.ReactNode; title: string }>) {
  return (
    <Card className="mx-auto max-w-2xl text-center">
      <CardContent className="space-y-4 py-10">
        <h1 className="text-2xl font-bold">{title}</h1>
        {children}
      </CardContent>
    </Card>
  );
}

const linkClasses = "font-semibold text-[var(--primary)] hover:underline";
