import type { ReactNode } from "react";

import { Header } from "./header";
import { Sidebar } from "./sidebar";

type AppShellProps = Readonly<{
  children: ReactNode;
}>;

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="min-h-screen">
      <a
        href="#main-content"
        className="fixed left-4 top-3 z-[60] -translate-y-24 rounded-[var(--radius-sm)] bg-[var(--foreground)] px-4 py-2 text-sm font-semibold text-[var(--primary-foreground)] transition focus-visible:translate-y-0"
      >
        Skip to main content
      </a>
      <Header />
      <div className="mx-auto flex min-h-[calc(100vh-4.5rem)] max-w-[96rem]">
        <Sidebar />
        <main id="main-content" tabIndex={-1} className="min-w-0 flex-1">
          {children}
        </main>
      </div>
    </div>
  );
}
