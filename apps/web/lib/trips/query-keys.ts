export const tripKeys = {
  all: ["trips"] as const,
  details: () => [...tripKeys.all, "detail"] as const,
  detail: (tripId: string) => [...tripKeys.details(), tripId] as const,
  members: (tripId: string) => [...tripKeys.detail(tripId), "members"] as const,
  lists: () => [...tripKeys.all, "list"] as const,
  list: (page: number, pageSize: number) =>
    [...tripKeys.lists(), { page, pageSize }] as const,
};
