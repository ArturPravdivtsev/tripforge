import type {
  AddTripMemberRequest,
  CreateTripRequest,
  Trip,
  TripParticipant,
  TripsPage,
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

  addMember(
    tripId: string,
    input: AddTripMemberRequest,
  ): Promise<TripParticipant> {
    return apiFetch(`/api/trips/${tripId}/members`, {
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
};
