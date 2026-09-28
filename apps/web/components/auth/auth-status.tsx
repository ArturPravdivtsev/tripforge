"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { AuthUser } from "@tripforge/contracts";
import { Button } from "@tripforge/ui";

import { NotificationBell } from "@/components/notifications/notification-bell";
import { AuthenticatedRealtimeBridge } from "@/components/realtime/authenticated-realtime-bridge";
import { authApi } from "@/lib/api/auth";
import { ApiClientError } from "@/lib/api/errors";
import { clearAuthenticatedCache } from "@/lib/auth/cache";

type AuthState =
  | { status: "loading" }
  | { status: "guest" }
  | { status: "authenticated"; user: AuthUser }
  | { status: "error" };

async function resolveAuthState(): Promise<AuthState> {
  try {
    const response = await authApi.me();

    return { status: "authenticated", user: response.user };
  } catch (error) {
    return error instanceof ApiClientError && error.status === 401
      ? { status: "guest" }
      : { status: "error" };
  }
}

export function AuthStatus() {
  const queryClient = useQueryClient();
  const [authState, setAuthState] = useState<AuthState>({ status: "loading" });
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  function retryDiscovery() {
    setAuthState({ status: "loading" });
    void resolveAuthState().then(setAuthState);
  }

  useEffect(() => {
    let active = true;

    void resolveAuthState().then((state) => {
      if (active) {
        if (state.status === "guest") {
          void clearAuthenticatedCache(queryClient);
        }
        setAuthState(state);
      }
    });

    return () => {
      active = false;
    };
  }, [queryClient]);

  async function logout() {
    setIsLoggingOut(true);

    try {
      await authApi.logout();
      await clearAuthenticatedCache(queryClient);
      setAuthState({ status: "guest" });
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 401) {
        await clearAuthenticatedCache(queryClient);
        setAuthState({ status: "guest" });
      } else {
        setAuthState({ status: "error" });
      }
    } finally {
      setIsLoggingOut(false);
    }
  }

  if (authState.status === "loading") {
    return (
      <span role="status" className="text-sm text-[var(--muted-foreground)]">
        Checking session…
      </span>
    );
  }

  if (authState.status === "guest") {
    return (
      <div className="flex items-center gap-2">
        <Link className="text-sm font-semibold hover:underline" href="/login">
          Sign in
        </Link>
        <Link
          className="hidden min-h-9 items-center rounded-[var(--radius-md)] bg-[var(--primary)] px-3 py-1.5 text-sm font-semibold text-[var(--primary-foreground)] sm:inline-flex"
          href="/register"
        >
          Create account
        </Link>
      </div>
    );
  }

  if (authState.status === "error") {
    return (
      <div className="flex items-center gap-2" role="status">
        <span className="hidden text-sm text-[var(--muted-foreground)] sm:inline">
          Session unavailable
        </span>
        <Button size="sm" variant="secondary" onClick={retryDiscovery}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <>
      <AuthenticatedRealtimeBridge />
      <div className="flex min-w-0 items-center gap-2">
        <NotificationBell />
        <span className="hidden max-w-44 truncate text-sm font-medium sm:inline">
          {authState.user.displayName ?? authState.user.email}
        </span>
        <Button
          size="sm"
          variant="secondary"
          disabled={isLoggingOut}
          onClick={() => void logout()}
        >
          {isLoggingOut ? "Logging out…" : "Logout"}
        </Button>
      </div>
    </>
  );
}
