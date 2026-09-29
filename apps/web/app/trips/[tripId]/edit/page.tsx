import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Container } from "@tripforge/ui";

import { AppShell } from "@/components/app-shell";
import { EditTripScreen } from "@/components/trips/edit-trip-screen";

export const metadata: Metadata = { title: "Edit trip" };

type EditTripPageProps = Readonly<{
  params: Promise<{ tripId: string }>;
}>;

export default async function EditTripPage({ params }: EditTripPageProps) {
  const { tripId } = await params;

  return (
    <AppShell>
      <Container className="py-8 sm:py-12">
        <Card className="mx-auto max-w-2xl">
          <CardHeader>
            <CardTitle as="h1">Edit trip</CardTitle>
            <CardDescription>Update the trip name or travel dates.</CardDescription>
          </CardHeader>
          <CardContent>
            <EditTripScreen tripId={tripId} />
          </CardContent>
        </Card>
      </Container>
    </AppShell>
  );
}
