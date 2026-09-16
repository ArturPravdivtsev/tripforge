import type { QueryClient } from "@tanstack/react-query";

import { tripKeys } from "./query-keys";

export async function clearTripCache(queryClient: QueryClient): Promise<void> {
  await queryClient.cancelQueries({ queryKey: tripKeys.all });
  queryClient.setQueriesData({ queryKey: tripKeys.all }, undefined);
  queryClient.removeQueries({ queryKey: tripKeys.all });
}
