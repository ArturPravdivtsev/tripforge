import type {
  AddTripMemberRequest,
  CreateTripDestinationRequest,
  CreateTripRequest,
  ReorderTripDestinationsRequest,
  Trip,
  TripDay,
  TripDestination,
  TripParticipant,
  TripsPage,
  UpdateTripDayRequest,
  UpdateTripDestinationRequest,
  UpdateTripMemberRequest,
  UpdateTripRequest,
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

  reorderDestinations(
    tripId: string,
    input: ReorderTripDestinationsRequest,
  ): Promise<TripDestination[]> {
    return apiFetch(`/api/trips/${tripId}/destinations/reorder`, {
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
};
