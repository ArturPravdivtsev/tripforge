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
