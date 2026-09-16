import Link from "next/link";
import { Container } from "@tripforge/ui";

import { AppShell } from "@/components/app-shell";
import { TripsDashboard } from "@/components/trips/trips-dashboard";
import { parseTripsPage } from "@/lib/trips/pagination";

type TripsPageProps = Readonly<{
  searchParams: Promise<{ page?: string | string[] }>;
}>;

export default async function TripsPage({ searchParams }: TripsPageProps) {
  const page = parseTripsPage((await searchParams).page);

  return (
    <AppShell>
      <Container className="py-8 sm:py-12">
        <div className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">
              Trips
            </h1>
            <p className="mt-2 text-[var(--muted-foreground)]">
              Plan and manage your journeys.
            </p>
          </div>
          <Link
            className="inline-flex min-h-11 items-center justify-center self-start rounded-[var(--radius-md)] bg-[var(--primary)] px-5 py-2.5 font-semibold text-[var(--primary-foreground)] shadow-sm transition hover:brightness-95"
            href="/trips/new"
          >
            + Create trip
          </Link>
        </div>
        <TripsDashboard page={page} />
      </Container>
    </AppShell>
  );
}
