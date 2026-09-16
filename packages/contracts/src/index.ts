export interface AuthUser {
  id: string;
  email: string;
  displayName: string | null;
}

export interface RegisterRequest {
  email: string;
  password: string;
  displayName?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthResponse {
  user: AuthUser;
}

export interface ApiErrorResponse {
  statusCode: number;
  code: string;
  message: string;
  path: string;
  timestamp: string;
  errors?: string[];
}

export type TripAccessRole = "owner" | "editor" | "viewer";

export type TripMemberRole = Exclude<TripAccessRole, "owner">;

export interface Trip {
  id: string;
  name: string;
  startsOn: string | null;
  endsOn: string | null;
  createdAt: string;
  updatedAt: string;
  accessRole: TripAccessRole;
}

export interface TripParticipant {
  user: AuthUser;
  role: TripAccessRole;
}

export interface AddTripMemberRequest {
  email: string;
  role: TripMemberRole;
}

export interface UpdateTripMemberRequest {
  role: TripMemberRole;
}

export interface TripDestination {
  id: string;
  name: string;
  position: number;
  createdAt: string;
  updatedAt: string;
}

export interface TripDay {
  id: string;
  date: string;
  destinationId: string | null;
}

export interface CreateTripDestinationRequest {
  name: string;
}

export interface UpdateTripDestinationRequest {
  name: string;
}

export interface ReorderTripDestinationsRequest {
  destinationIds: string[];
}

export interface UpdateTripDayRequest {
  destinationId: string | null;
}

export interface CreateTripRequest {
  name: string;
  startsOn?: string | null;
  endsOn?: string | null;
}

export interface UpdateTripRequest {
  name?: string;
  startsOn?: string | null;
  endsOn?: string | null;
}

export interface TripsPage {
  items: Trip[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}
