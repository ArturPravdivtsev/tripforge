import type { Metadata } from "next";
import { Container } from "@tripforge/ui";

import { AppShell } from "@/components/app-shell";
import { ReservationsScreen } from "@/components/trips/reservations-screen";

export const metadata: Metadata = { title: "Reservations" };

type ReservationsPageProps = Readonly<{
  params: Promise<{ tripId: string }>;
}>;

export default async function ReservationsPage({ params }: ReservationsPageProps) {
  const { tripId } = await params;

  return (
    <AppShell>
      <Container className="py-8 sm:py-12">
        <ReservationsScreen tripId={tripId} />
      </Container>
    </AppShell>
  );
}
