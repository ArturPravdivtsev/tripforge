import type {
  AddTripMemberRequest,
  CreateItineraryItemRequest,
  CreateTripExpenseRequest,
  CreateTripRouteRequest,
  CreateTripReservationRequest,
  CreateTripDestinationRequest,
  CreateTripRequest,
  ItineraryItem,
  ReorderItineraryItemsRequest,
  ReorderTripDestinationsRequest,
  Trip,
  TripDay,
  TripDestination,
  TripExpense,
  TripExpenseBalances,
  TripParticipant,
  TripRouteSegment,
  TripReservation,
  TripsPage,
  UpdateTripDayRequest,
  UpdateTripExpenseRequest,
  UpdateTripDestinationRequest,
  UpdateTripMemberRequest,
  UpdateTripRequest,
  UpdateTripRouteRequest,
  UpdateTripReservationRequest,
  UpdateItineraryItemRequest,
} from "@tripforge/contracts";

import { apiFetch } from "./client";

type RequestOptions = Readonly<{
  signal?: AbortSignal;
}>;

export const tripsApi = {
  create(input: CreateTripRequest): Promise<Trip> {
    return apiFetch("/api/trips", { json: input, method: "POST" });
  },

  get(tripId: string, options: RequestOptions = {}): Promise<Trip> {
    return apiFetch(`/api/trips/${tripId}`, { signal: options.signal });
  },

  list(
    params: Readonly<{ page: number; pageSize: number }>,
    options: RequestOptions = {},
  ): Promise<TripsPage> {
    const query = new URLSearchParams({
      page: String(params.page),
      pageSize: String(params.pageSize),
    });

    return apiFetch(`/api/trips?${query.toString()}`, {
      signal: options.signal,
    });
  },

  listMembers(
    tripId: string,
    options: RequestOptions = {},
  ): Promise<TripParticipant[]> {
    return apiFetch(`/api/trips/${tripId}/members`, {
      signal: options.signal,
    });
  },

  listDestinations(
    tripId: string,
    options: RequestOptions = {},
  ): Promise<TripDestination[]> {
    return apiFetch(`/api/trips/${tripId}/destinations`, {
      signal: options.signal,
    });
  },

  listDays(
    tripId: string,
    options: RequestOptions = {},
  ): Promise<TripDay[]> {
    return apiFetch(`/api/trips/${tripId}/days`, { signal: options.signal });
  },

  listItineraryItems(
    tripId: string,
    options: RequestOptions = {},
  ): Promise<ItineraryItem[]> {
    return apiFetch(`/api/trips/${tripId}/itinerary-items`, {
      signal: options.signal,
    });
  },

  listRoutes(
    tripId: string,
    options: RequestOptions = {},
  ): Promise<TripRouteSegment[]> {
    return apiFetch(`/api/trips/${tripId}/routes`, {
      signal: options.signal,
    });
  },

  listReservations(
    tripId: string,
    options: RequestOptions = {},
  ): Promise<TripReservation[]> {
    return apiFetch(`/api/trips/${tripId}/reservations`, {
      signal: options.signal,
    });
  },

  listExpenses(
    tripId: string,
    options: RequestOptions = {},
  ): Promise<TripExpense[]> {
    return apiFetch(`/api/trips/${tripId}/expenses`, {
      signal: options.signal,
    });
  },

  getExpense(
    tripId: string,
    expenseId: string,
    options: RequestOptions = {},
  ): Promise<TripExpense> {
    return apiFetch(`/api/trips/${tripId}/expenses/${expenseId}`, {
      signal: options.signal,
    });
  },

  getExpenseBalances(
    tripId: string,
    options: RequestOptions = {},
  ): Promise<TripExpenseBalances> {
    return apiFetch(`/api/trips/${tripId}/expenses/balances`, {
      signal: options.signal,
    });
  },

  getReservation(
    tripId: string,
    reservationId: string,
    options: RequestOptions = {},
  ): Promise<TripReservation> {
    return apiFetch(`/api/trips/${tripId}/reservations/${reservationId}`, {
      signal: options.signal,
    });
  },

  addMember(
    tripId: string,
    input: AddTripMemberRequest,
  ): Promise<TripParticipant> {
    return apiFetch(`/api/trips/${tripId}/members`, {
      json: input,
      method: "POST",
    });
  },

  createDestination(
    tripId: string,
    input: CreateTripDestinationRequest,
  ): Promise<TripDestination> {
    return apiFetch(`/api/trips/${tripId}/destinations`, {
      json: input,
      method: "POST",
    });
  },

  createItineraryItem(
    tripId: string,
    input: CreateItineraryItemRequest,
  ): Promise<ItineraryItem> {
    return apiFetch(`/api/trips/${tripId}/itinerary-items`, {
      json: input,
      method: "POST",
    });
  },

  createRoute(
    tripId: string,
    input: CreateTripRouteRequest,
  ): Promise<TripRouteSegment> {
    return apiFetch(`/api/trips/${tripId}/routes`, {
      json: input,
      method: "POST",
    });
  },

  createReservation(
    tripId: string,
    input: CreateTripReservationRequest,
  ): Promise<TripReservation> {
    return apiFetch(`/api/trips/${tripId}/reservations`, {
      json: input,
      method: "POST",
    });
  },

  createExpense(
    tripId: string,
    input: CreateTripExpenseRequest,
  ): Promise<TripExpense> {
    return apiFetch(`/api/trips/${tripId}/expenses`, {
      json: input,
      method: "POST",
    });
  },

  remove(tripId: string): Promise<void> {
    return apiFetch(`/api/trips/${tripId}`, { method: "DELETE" });
  },

  removeMember(tripId: string, userId: string): Promise<void> {
    return apiFetch(`/api/trips/${tripId}/members/${userId}`, {
      method: "DELETE",
    });
  },

  removeDestination(tripId: string, destinationId: string): Promise<void> {
    return apiFetch(`/api/trips/${tripId}/destinations/${destinationId}`, {
      method: "DELETE",
    });
  },

  removeItineraryItem(tripId: string, itemId: string): Promise<void> {
    return apiFetch(`/api/trips/${tripId}/itinerary-items/${itemId}`, {
      method: "DELETE",
    });
  },

  removeRoute(tripId: string, routeId: string): Promise<void> {
    return apiFetch(`/api/trips/${tripId}/routes/${routeId}`, {
      method: "DELETE",
    });
  },

  removeReservation(tripId: string, reservationId: string): Promise<void> {
    return apiFetch(`/api/trips/${tripId}/reservations/${reservationId}`, {
      method: "DELETE",
    });
  },

  removeExpense(tripId: string, expenseId: string): Promise<void> {
    return apiFetch(`/api/trips/${tripId}/expenses/${expenseId}`, {
      method: "DELETE",
    });
  },

  reorderDestinations(
    tripId: string,
    input: ReorderTripDestinationsRequest,
  ): Promise<TripDestination[]> {
    return apiFetch(`/api/trips/${tripId}/destinations/reorder`, {
      json: input,
      method: "PATCH",
    });
  },

  reorderItineraryItems(
    tripId: string,
    input: ReorderItineraryItemsRequest,
  ): Promise<ItineraryItem[]> {
    return apiFetch(`/api/trips/${tripId}/itinerary-items/reorder`, {
      json: input,
      method: "PATCH",
    });
  },

  update(tripId: string, input: UpdateTripRequest): Promise<Trip> {
    return apiFetch(`/api/trips/${tripId}`, {
      json: input,
      method: "PATCH",
    });
  },

  updateMemberRole(
    tripId: string,
    userId: string,
    input: UpdateTripMemberRequest,
  ): Promise<TripParticipant> {
    return apiFetch(`/api/trips/${tripId}/members/${userId}`, {
      json: input,
      method: "PATCH",
    });
  },

  updateDestination(
    tripId: string,
    destinationId: string,
    input: UpdateTripDestinationRequest,
  ): Promise<TripDestination> {
    return apiFetch(`/api/trips/${tripId}/destinations/${destinationId}`, {
      json: input,
      method: "PATCH",
    });
  },

  updateDay(
    tripId: string,
    dayId: string,
    input: UpdateTripDayRequest,
  ): Promise<TripDay> {
    return apiFetch(`/api/trips/${tripId}/days/${dayId}`, {
      json: input,
      method: "PATCH",
    });
  },

  updateItineraryItem(
    tripId: string,
    itemId: string,
    input: UpdateItineraryItemRequest,
  ): Promise<ItineraryItem> {
    return apiFetch(`/api/trips/${tripId}/itinerary-items/${itemId}`, {
      json: input,
      method: "PATCH",
    });
  },

  updateRoute(
    tripId: string,
    routeId: string,
    input: UpdateTripRouteRequest,
  ): Promise<TripRouteSegment> {
    return apiFetch(`/api/trips/${tripId}/routes/${routeId}`, {
      json: input,
      method: "PATCH",
    });
  },

  updateReservation(
    tripId: string,
    reservationId: string,
    input: UpdateTripReservationRequest,
  ): Promise<TripReservation> {
    return apiFetch(`/api/trips/${tripId}/reservations/${reservationId}`, {
      json: input,
      method: "PATCH",
    });
  },

  updateExpense(
    tripId: string,
    expenseId: string,
    input: UpdateTripExpenseRequest,
  ): Promise<TripExpense> {
    return apiFetch(`/api/trips/${tripId}/expenses/${expenseId}`, {
      json: input,
      method: "PATCH",
    });
  },
};
