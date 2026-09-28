import type { QueryClient } from "@tanstack/react-query";

import { notificationKeys } from "@/lib/notifications/query-keys";
import { clearTripCache } from "@/lib/trips/cache";

export async function clearAuthenticatedCache(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    clearTripCache(queryClient),
    queryClient.cancelQueries({ queryKey: notificationKeys.all }),
  ]);
  queryClient.removeQueries({ queryKey: notificationKeys.all });
}
