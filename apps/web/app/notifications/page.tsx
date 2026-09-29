import type { Metadata } from "next";
import { Card, CardContent, CardHeader, CardTitle, Container } from "@tripforge/ui";

import { AppShell } from "@/components/app-shell";
import { NotificationsScreen } from "@/components/notifications/notifications-screen";

export const metadata: Metadata = { title: "Notifications" };

export default function NotificationsPage() {
  return (
    <AppShell>
      <Container className="py-8 sm:py-12">
        <Card>
          <CardHeader>
            <CardTitle as="h1">Notifications</CardTitle>
          </CardHeader>
          <CardContent>
            <NotificationsScreen />
          </CardContent>
        </Card>
      </Container>
    </AppShell>
  );
}
