import type { QueryClient, QueryKey } from "@tanstack/react-query";
import type { TripRealtimeResource } from "@tripforge/contracts";

import { tripKeys } from "@/lib/trips/query-keys";

export function queryKeysForRealtimeResource(
  tripId: string,
  resource: TripRealtimeResource,
): readonly QueryKey[] {
  switch (resource) {
    case "trip":
      return [tripKeys.detail(tripId), tripKeys.lists()];
    case "members":
      return [tripKeys.members(tripId)];
    case "destinations":
      return [tripKeys.destinations(tripId), tripKeys.searches(tripId)];
    case "days":
      return [tripKeys.days(tripId)];
    case "itinerary":
      return [tripKeys.itinerary(tripId), tripKeys.searches(tripId)];
    case "routes":
      return [tripKeys.routes(tripId)];
    case "reservations":
      return [tripKeys.reservations(tripId), tripKeys.searches(tripId)];
    case "expenses":
      return [tripKeys.expenses(tripId), tripKeys.searches(tripId)];
    case "documents":
      return [tripKeys.documents(tripId), tripKeys.searches(tripId)];
  }
}

export async function invalidateRealtimeResources(
  queryClient: QueryClient,
  tripId: string,
  resources: readonly TripRealtimeResource[],
): Promise<void> {
  const keys = resources.flatMap((resource) =>
    queryKeysForRealtimeResource(tripId, resource),
  );
  const uniqueKeys = new Map(
    keys.map((queryKey) => [JSON.stringify(queryKey), queryKey]),
  );
  const detailKey = JSON.stringify(tripKeys.detail(tripId));

  await Promise.all(
    [...uniqueKeys].map(([serializedKey, queryKey]) =>
      queryClient.invalidateQueries({
        exact: serializedKey === detailKey,
        queryKey,
        refetchType: "active",
      }),
    ),
  );
}
