import type { Metadata } from "next";
import { Container } from "@tripforge/ui";

import { AppShell } from "@/components/app-shell";
import { AssistantScreen } from "@/components/trips/assistant-screen";

export const metadata: Metadata = { title: "Trip Assistant" };

type AssistantPageProps = Readonly<{
  params: Promise<{ tripId: string }>;
}>;

export default async function AssistantPage({ params }: AssistantPageProps) {
  const { tripId } = await params;
  return (
    <AppShell>
      <Container className="py-8 sm:py-12">
        <AssistantScreen tripId={tripId} />
      </Container>
    </AppShell>
  );
}
