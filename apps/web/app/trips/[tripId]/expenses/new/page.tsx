import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Container,
} from "@tripforge/ui";

import { AppShell } from "@/components/app-shell";
import { NewExpenseScreen } from "@/components/trips/new-expense-screen";

type NewExpensePageProps = Readonly<{
  params: Promise<{ tripId: string }>;
}>;

export default async function NewExpensePage({ params }: NewExpensePageProps) {
  const { tripId } = await params;
  return (
    <AppShell>
      <Container className="py-8 sm:py-12">
        <Card className="mx-auto max-w-4xl">
          <CardHeader>
            <CardTitle>New expense</CardTitle>
            <CardDescription>
              Record an exact shared cost. TripForge never converts currencies.
            </CardDescription>
          </CardHeader>
          <CardContent><NewExpenseScreen tripId={tripId} /></CardContent>
        </Card>
      </Container>
    </AppShell>
  );
}
