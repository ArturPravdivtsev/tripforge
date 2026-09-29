"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Button, Container } from "@tripforge/ui";

import { navigationItems } from "./navigation-items";

export function MobileNavigation() {
  const pathname = usePathname() ?? "";
  const [isOpen, setIsOpen] = useState(false);
  const firstLinkRef = useRef<HTMLAnchorElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  function closeNavigation(): void {
    setIsOpen(false);
    triggerRef.current?.focus();
  }

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    firstLinkRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        closeNavigation();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  return (
    <>
      <Button
        ref={triggerRef}
        variant="ghost"
        size="sm"
        className="md:hidden"
        aria-controls={isOpen ? "mobile-navigation" : undefined}
        aria-expanded={isOpen}
        aria-label={isOpen ? "Menu, close navigation" : "Menu, open navigation"}
        onClick={() => (isOpen ? closeNavigation() : setIsOpen(true))}
      >
        Menu
      </Button>

      {isOpen ? (
        <div
          id="mobile-navigation"
          className="fixed inset-x-0 bottom-0 top-[4.5rem] z-40 overflow-y-auto border-t border-[var(--border)] bg-[var(--surface)] md:hidden"
        >
          <Container className="py-6">
            <div className="flex items-center justify-between gap-4">
              <p className="font-semibold">Navigation</p>
              <Button
                variant="ghost"
                size="sm"
                aria-label="Close navigation"
                onClick={closeNavigation}
              >
                Close
              </Button>
            </div>

            <nav aria-label="Mobile navigation" className="mt-6">
              <ul className="space-y-2">
                {navigationItems.map((item, index) => (
                  <li key={item.label}>
                    <Link
                      ref={index === 0 ? firstLinkRef : undefined}
                      aria-current={
                        pathname === item.href || pathname.startsWith(`${item.href}/`)
                          ? "page"
                          : undefined
                      }
                      href={item.href}
                      className="block rounded-[var(--radius-md)] bg-[var(--surface-muted)] px-4 py-3 font-semibold transition hover:bg-[var(--muted)]"
                      onClick={closeNavigation}
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </Container>
        </div>
      ) : null}
    </>
  );
}
