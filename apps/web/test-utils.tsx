import type { ReactElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";

export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: { gcTime: Infinity, retry: false },
    },
  });
}

export function renderWithQueryClient(
  ui: ReactElement,
  queryClient = createTestQueryClient(),
) {
  const renderResult = render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );

  return {
    queryClient,
    ...renderResult,
    rerender(nextUi: ReactElement) {
      renderResult.rerender(
        <QueryClientProvider client={queryClient}>{nextUi}</QueryClientProvider>,
      );
    },
  };
}
