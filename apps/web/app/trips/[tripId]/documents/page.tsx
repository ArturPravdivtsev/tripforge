import { Container } from "@tripforge/ui";

import { AppShell } from "@/components/app-shell";
import { DocumentsScreen } from "@/components/trips/documents-screen";

type DocumentsPageProps = Readonly<{
  params: Promise<{ tripId: string }>;
}>;

export default async function DocumentsPage({ params }: DocumentsPageProps) {
  const { tripId } = await params;
  return (
    <AppShell>
      <Container className="py-8 sm:py-12">
        <DocumentsScreen tripId={tripId} />
      </Container>
    </AppShell>
  );
}
