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
import { EditReservationScreen } from "@/components/trips/edit-reservation-screen";

export const metadata: Metadata = { title: "Edit reservation" };

type EditReservationPageProps = Readonly<{
  params: Promise<{ reservationId: string; tripId: string }>;
}>;

export default async function EditReservationPage({
  params,
}: EditReservationPageProps) {
  const { reservationId, tripId } = await params;

  return (
    <AppShell>
      <Container className="py-8 sm:py-12">
        <Card className="mx-auto max-w-4xl">
          <CardHeader>
            <CardTitle as="h1">Edit reservation</CardTitle>
            <CardDescription>
              Update TripForge booking details. Provider bookings are not contacted.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <EditReservationScreen reservationId={reservationId} tripId={tripId} />
          </CardContent>
        </Card>
      </Container>
    </AppShell>
  );
}
