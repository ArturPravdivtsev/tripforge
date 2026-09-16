"use client";

import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { ApiClientError } from "@/lib/api/errors";

type QueryProviderProps = Readonly<{
  children: ReactNode;
}>;

export function shouldRetryRequest(failureCount: number, error: unknown) {
  if (error instanceof ApiClientError && error.status < 500) {
    return false;
  }

  return failureCount < 1;
}

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: shouldRetryRequest,
        staleTime: 30_000,
      },
    },
  });
}

export function QueryProvider({ children }: QueryProviderProps) {
  const [queryClient] = useState(createQueryClient);

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
