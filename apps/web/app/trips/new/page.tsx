import { Card, CardContent, CardDescription, CardHeader, CardTitle, Container } from "@tripforge/ui";

import { AppShell } from "@/components/app-shell";
import { CreateTripForm } from "@/components/trips/create-trip-form";

export default function NewTripPage() {
  return (
    <AppShell>
      <Container className="py-8 sm:py-12">
        <Card className="mx-auto max-w-2xl">
          <CardHeader>
            <CardTitle>Create trip</CardTitle>
            <CardDescription>Start with a name and optional travel dates.</CardDescription>
          </CardHeader>
          <CardContent>
            <CreateTripForm />
          </CardContent>
        </Card>
      </Container>
    </AppShell>
  );
}
