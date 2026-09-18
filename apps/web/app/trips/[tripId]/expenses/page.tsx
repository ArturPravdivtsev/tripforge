import { Container } from "@tripforge/ui";

import { AppShell } from "@/components/app-shell";
import { ExpensesScreen } from "@/components/trips/expenses-screen";

type ExpensesPageProps = Readonly<{
  params: Promise<{ tripId: string }>;
}>;

export default async function ExpensesPage({ params }: ExpensesPageProps) {
  const { tripId } = await params;
  return (
    <AppShell>
      <Container className="py-8 sm:py-12">
        <ExpensesScreen tripId={tripId} />
      </Container>
    </AppShell>
  );
}
