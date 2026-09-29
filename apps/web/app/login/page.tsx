import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Container } from "@tripforge/ui";

import { AppShell } from "@/components/app-shell";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <AppShell>
      <Container className="py-10 sm:py-16">
        <Card className="mx-auto max-w-lg">
          <CardHeader>
            <CardTitle as="h1">Welcome back</CardTitle>
            <CardDescription>Sign in to continue planning with TripForge.</CardDescription>
          </CardHeader>
          <CardContent>
            <LoginForm />
          </CardContent>
        </Card>
      </Container>
    </AppShell>
  );
}
