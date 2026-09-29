import type { Metadata } from "next";
import { Container } from "@tripforge/ui";

import { AppShell } from "@/components/app-shell";
import { MembersScreen } from "@/components/trips/members-screen";

export const metadata: Metadata = { title: "Trip members" };

type MembersPageProps = Readonly<{
  params: Promise<{ tripId: string }>;
}>;

export default async function MembersPage({ params }: MembersPageProps) {
  const { tripId } = await params;

  return (
    <AppShell>
      <Container className="py-8 sm:py-12">
        <MembersScreen tripId={tripId} />
      </Container>
    </AppShell>
  );
}
