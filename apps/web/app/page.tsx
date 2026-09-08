import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Container,
} from "@tripforge/ui";

import { AppShell } from "@/components/app-shell";

const features = [
  {
    id: "01",
    title: "Build itineraries",
    description: "Keep every day organised without losing the bigger picture.",
  },
  {
    id: "02",
    title: "Travel together",
    description: "Shape plans collaboratively with everyone joining the trip.",
  },
  {
    id: "03",
    title: "Everything in one place",
    description: "Bring reservations, expenses, documents, and notes together.",
  },
] as const;

export default function HomePage() {
  return (
    <AppShell>
      <Container className="py-8 sm:py-12 lg:py-16">
        <section className="relative overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] px-6 py-10 shadow-[var(--shadow-card)] sm:px-10 sm:py-14 lg:px-16 lg:py-20">
          <div
            aria-hidden="true"
            className="absolute -right-20 -top-24 h-64 w-64 rounded-full bg-[var(--muted)] opacity-80 blur-3xl"
          />
          <div className="relative max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--primary)]">
              Collaborative travel planning
            </p>
            <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em] text-balance sm:text-5xl lg:text-6xl">
              Plan your next adventure
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-[var(--muted-foreground)] sm:text-xl">
              Create itineraries, keep reservations together, and coordinate
              trips with the people travelling with you.
            </p>
            <div className="mt-8 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
              <Button disabled aria-describedby="trip-cta-status">
                Create your first trip
              </Button>
              <span
                id="trip-cta-status"
                className="text-sm text-[var(--muted-foreground)]"
              >
                Trip creation arrives in a future stage.
              </span>
            </div>
          </div>
        </section>

        <section
          id="trips"
          aria-labelledby="planning-tools-heading"
          className="scroll-mt-24 py-12 sm:py-16"
        >
          <div className="max-w-2xl">
            <p className="text-sm font-semibold text-[var(--primary)]">
              One calm workspace
            </p>
            <h2
              id="planning-tools-heading"
              className="mt-2 text-3xl font-semibold tracking-[-0.03em]"
            >
              Your plans, clearly organised
            </h2>
          </div>

          <div className="mt-8 grid gap-5 lg:grid-cols-3">
            {features.map((feature) => (
              <Card key={feature.title}>
                <CardHeader>
                  <span
                    aria-hidden="true"
                    className="text-sm font-semibold text-[var(--primary)]"
                  >
                    {feature.id}
                  </span>
                  <CardTitle>{feature.title}</CardTitle>
                  <CardDescription>{feature.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-1.5 w-12 rounded-full bg-[var(--muted)]" />
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section id="explore" className="scroll-mt-24 pb-12 sm:pb-16">
          <div className="flex flex-col gap-6 rounded-[var(--radius-lg)] bg-[var(--foreground)] px-6 py-8 text-[var(--primary-foreground)] sm:flex-row sm:items-center sm:justify-between sm:px-10">
            <div className="max-w-2xl">
              <h2 className="text-2xl font-semibold tracking-tight">
                Start with the shape of a great trip
              </h2>
              <p className="mt-2 text-sm leading-6 text-white/70 sm:text-base">
                The planning workspace is ready. Real destinations and shared
                itineraries come next.
              </p>
            </div>
            <Button variant="secondary" disabled>
              Explore inspiration soon
            </Button>
          </div>
        </section>
      </Container>
    </AppShell>
  );
}
