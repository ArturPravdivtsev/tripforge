import type { Metadata } from "next";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Container,
} from "@tripforge/ui";

import { AppShell } from "@/components/app-shell";
import { NewReservationScreen } from "@/components/trips/new-reservation-screen";

export const metadata: Metadata = { title: "New reservation" };

type NewReservationPageProps = Readonly<{
  params: Promise<{ tripId: string }>;
}>;

export default async function NewReservationPage({ params }: NewReservationPageProps) {
  const { tripId } = await params;

  return (
    <AppShell>
      <Container className="py-8 sm:py-12">
        <Card className="mx-auto max-w-4xl">
          <CardHeader>
            <CardTitle as="h1">New reservation</CardTitle>
            <CardDescription>Add structured booking information to this trip.</CardDescription>
          </CardHeader>
          <CardContent>
            <NewReservationScreen tripId={tripId} />
          </CardContent>
        </Card>
      </Container>
    </AppShell>
  );
}
