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
  latitude: number | null;
  longitude: number | null;
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
  latitude?: number | null;
  longitude?: number | null;
  name?: string;
}

export interface ReorderTripDestinationsRequest {
  destinationIds: string[];
}

export interface UpdateTripDayRequest {
  destinationId: string | null;
}

export type ItineraryItemKind =
  | "activity"
  | "food"
  | "transport"
  | "accommodation"
  | "other";

export type PlaceProvider = "maptiler";

export interface ItineraryPlace {
  name: string;
  address: string | null;
  latitude: number;
  longitude: number;
  provider: PlaceProvider;
  providerReference: string | null;
}

export interface ItineraryPlaceInput {
  name: string;
  address?: string | null;
  latitude: number;
  longitude: number;
  provider: PlaceProvider;
  providerReference?: string | null;
}

export interface ItineraryItem {
  id: string;
  dayId: string;
  kind: ItineraryItemKind;
  title: string;
  startTime: string | null;
  notes: string | null;
  place: ItineraryPlace | null;
  position: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateItineraryItemRequest {
  dayId: string;
  kind: ItineraryItemKind;
  title: string;
  startTime?: string | null;
  notes?: string | null;
  place?: ItineraryPlaceInput | null;
}

export interface UpdateItineraryItemRequest {
  kind?: ItineraryItemKind;
  title?: string;
  startTime?: string | null;
  notes?: string | null;
  place?: ItineraryPlaceInput | null;
}

export interface ReorderItineraryItemsRequest {
  days: Array<{
    dayId: string;
    itemIds: string[];
  }>;
}

export type TripRouteMode = "walking" | "cycling" | "driving";

export interface TripRouteGeometry {
  type: "LineString";
  coordinates: [number, number][];
}

export interface TripRouteSegment {
  id: string;
  fromItemId: string;
  toItemId: string;
  mode: TripRouteMode;
  distanceMeters: number;
  durationSeconds: number;
  geometry: TripRouteGeometry;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTripRouteRequest {
  fromItemId: string;
  toItemId: string;
  mode: TripRouteMode;
}

export interface UpdateTripRouteRequest {
  mode: TripRouteMode;
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
