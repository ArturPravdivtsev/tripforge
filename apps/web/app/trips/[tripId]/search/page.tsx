import type { Metadata } from "next";
import { Container } from "@tripforge/ui";

import { AppShell } from "@/components/app-shell";
import { TripSearchScreen } from "@/components/trips/trip-search-screen";

export const metadata: Metadata = { title: "Search" };

type TripSearchPageProps = Readonly<{
  params: Promise<{ tripId: string }>;
}>;

export default async function TripSearchPage({ params }: TripSearchPageProps) {
  const { tripId } = await params;

  return (
    <AppShell>
      <Container className="py-8 sm:py-12">
        <TripSearchScreen tripId={tripId} />
      </Container>
    </AppShell>
  );
}
