export const tripKeys = {
  all: ["trips"] as const,
  details: () => [...tripKeys.all, "detail"] as const,
  detail: (tripId: string) => [...tripKeys.details(), tripId] as const,
  assistant: (tripId: string) =>
    [...tripKeys.detail(tripId), "assistant"] as const,
  assistantConversations: (tripId: string) =>
    [...tripKeys.assistant(tripId), "conversations"] as const,
  assistantConversation: (tripId: string, conversationId: string) =>
    [...tripKeys.assistantConversations(tripId), conversationId] as const,
  days: (tripId: string) => [...tripKeys.detail(tripId), "days"] as const,
  destinations: (tripId: string) =>
    [...tripKeys.detail(tripId), "destinations"] as const,
  itinerary: (tripId: string) =>
    [...tripKeys.detail(tripId), "itinerary"] as const,
  members: (tripId: string) => [...tripKeys.detail(tripId), "members"] as const,
  routes: (tripId: string) => [...tripKeys.detail(tripId), "routes"] as const,
  reservations: (tripId: string) =>
    [...tripKeys.detail(tripId), "reservations"] as const,
  reservation: (tripId: string, reservationId: string) =>
    [...tripKeys.reservations(tripId), reservationId] as const,
  expenses: (tripId: string) =>
    [...tripKeys.detail(tripId), "expenses"] as const,
  expense: (tripId: string, expenseId: string) =>
    [...tripKeys.expenses(tripId), "detail", expenseId] as const,
  expenseBalances: (tripId: string) =>
    [...tripKeys.expenses(tripId), "balances"] as const,
  documents: (tripId: string) =>
    [...tripKeys.detail(tripId), "documents"] as const,
  searches: (tripId: string) =>
    [...tripKeys.detail(tripId), "search"] as const,
  search: (tripId: string, query: string, types: string, limit = 20) =>
    [...tripKeys.searches(tripId), { limit, query, types }] as const,
  lists: () => [...tripKeys.all, "list"] as const,
  list: (page: number, pageSize: number) =>
    [...tripKeys.lists(), { page, pageSize }] as const,
};
