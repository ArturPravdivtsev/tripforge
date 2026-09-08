import Link from "next/link";

import { navigationItems } from "./navigation-items";

export function Sidebar() {
  return (
    <aside className="hidden w-64 shrink-0 border-r border-[var(--border)] bg-[var(--surface)] md:block">
      <div className="sticky top-[4.5rem] flex h-[calc(100vh-4.5rem)] flex-col px-4 py-6">
        <nav aria-label="Primary navigation">
          <ul className="space-y-1">
            {navigationItems.map((item, index) => (
              <li key={item.label}>
                <Link
                  href={item.href}
                  aria-current={index === 0 ? "page" : undefined}
                  className={
                    index === 0
                      ? "block rounded-[var(--radius-md)] bg-[var(--muted)] px-4 py-2.5 text-sm font-semibold text-[var(--primary)]"
                      : "block rounded-[var(--radius-md)] px-4 py-2.5 text-sm font-medium text-[var(--muted-foreground)] transition hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)]"
                  }
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="mt-auto rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-muted)] p-4">
          <p className="text-sm font-semibold">Planning workspace</p>
          <p className="mt-1 text-xs leading-5 text-[var(--muted-foreground)]">
            Your collaborative trips will live here.
          </p>
        </div>
      </div>
    </aside>
  );
}
