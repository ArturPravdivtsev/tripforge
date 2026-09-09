import Link from "next/link";

import { Container } from "@tripforge/ui";

import { AuthStatus } from "./auth/auth-status";
import { MobileNavigation } from "./mobile-navigation";

export function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-[var(--border)] bg-[var(--surface)]">
      <Container className="flex h-[4.5rem] items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/"
            className="shrink-0 text-lg font-bold tracking-[-0.03em] text-[var(--primary)]"
          >
            TripForge
          </Link>
          <span
            aria-hidden="true"
            className="hidden h-5 w-px bg-[var(--border)] sm:block"
          />
          <p className="hidden truncate text-sm text-[var(--muted-foreground)] sm:block">
            Plan better, travel together
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <AuthStatus />
          <MobileNavigation />
        </div>
      </Container>
    </header>
  );
}
