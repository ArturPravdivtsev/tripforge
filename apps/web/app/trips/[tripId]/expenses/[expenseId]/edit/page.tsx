import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Container,
} from "@tripforge/ui";

import { AppShell } from "@/components/app-shell";
import { EditExpenseScreen } from "@/components/trips/edit-expense-screen";

type EditExpensePageProps = Readonly<{
  params: Promise<{ expenseId: string; tripId: string }>;
}>;

export default async function EditExpensePage({ params }: EditExpensePageProps) {
  const { expenseId, tripId } = await params;
  return (
    <AppShell>
      <Container className="py-8 sm:py-12">
        <Card className="mx-auto max-w-4xl">
          <CardHeader>
            <CardTitle>Edit expense</CardTitle>
            <CardDescription>
              Update the amount, payer and exact participant shares.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <EditExpenseScreen expenseId={expenseId} tripId={tripId} />
          </CardContent>
        </Card>
      </Container>
    </AppShell>
  );
}
