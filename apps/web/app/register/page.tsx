import { Card, CardContent, CardDescription, CardHeader, CardTitle, Container } from "@tripforge/ui";

import { AppShell } from "@/components/app-shell";
import { RegisterForm } from "@/components/auth/register-form";

export default function RegisterPage() {
  return (
    <AppShell>
      <Container className="py-10 sm:py-16">
        <Card className="mx-auto max-w-lg">
          <CardHeader>
            <CardTitle>Create your account</CardTitle>
            <CardDescription>
              Start shaping trips and keep every detail together.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RegisterForm />
          </CardContent>
        </Card>
      </Container>
    </AppShell>
  );
}
