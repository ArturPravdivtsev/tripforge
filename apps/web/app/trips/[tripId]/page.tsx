import type { Metadata } from "next";
import { Container } from "@tripforge/ui";

import { AppShell } from "@/components/app-shell";
import { TripWorkspace } from "@/components/trips/trip-workspace";

export const metadata: Metadata = { title: "Trip workspace" };

type TripPageProps = Readonly<{
  params: Promise<{ tripId: string }>;
}>;

export default async function TripPage({ params }: TripPageProps) {
  const { tripId } = await params;

  return (
    <AppShell>
      <Container className="py-8 sm:py-12">
        <TripWorkspace tripId={tripId} />
      </Container>
    </AppShell>
  );
}
