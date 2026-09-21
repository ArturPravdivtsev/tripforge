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

export type TripReservationKind =
  | "accommodation"
  | "transport"
  | "restaurant"
  | "activity"
  | "other";

export type TripReservationStatus = "pending" | "confirmed" | "cancelled";

export type TransportReservationMode =
  | "flight"
  | "train"
  | "bus"
  | "ferry"
  | "other";

export interface TransportReservationDetails {
  mode: TransportReservationMode;
  operatorName: string | null;
  serviceNumber: string | null;
  originName: string;
  destinationName: string;
}

export interface TripReservation {
  id: string;
  kind: TripReservationKind;
  status: TripReservationStatus;
  title: string;
  providerName: string | null;
  confirmationCode: string | null;
  startDate: string;
  startTime: string | null;
  endDate: string | null;
  endTime: string | null;
  locationName: string | null;
  notes: string | null;
  itineraryItemId: string | null;
  transport: TransportReservationDetails | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTripReservationRequest {
  kind: TripReservationKind;
  status: TripReservationStatus;
  title: string;
  providerName?: string | null;
  confirmationCode?: string | null;
  startDate: string;
  startTime?: string | null;
  endDate?: string | null;
  endTime?: string | null;
  locationName?: string | null;
  notes?: string | null;
  itineraryItemId?: string | null;
  transport?: TransportReservationDetails | null;
}

export interface UpdateTripReservationRequest {
  kind?: TripReservationKind;
  status?: TripReservationStatus;
  title?: string;
  providerName?: string | null;
  confirmationCode?: string | null;
  startDate?: string;
  startTime?: string | null;
  endDate?: string | null;
  endTime?: string | null;
  locationName?: string | null;
  notes?: string | null;
  itineraryItemId?: string | null;
  transport?: TransportReservationDetails | null;
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

export type TripExpenseCategory =
  | "accommodation"
  | "transport"
  | "food"
  | "activity"
  | "shopping"
  | "other";

export type TripExpenseSplitMethod = "equal" | "custom";

export interface ExpenseParticipant {
  userId: string;
  displayName: string | null;
  email: string;
}

export interface TripExpenseShare {
  participant: ExpenseParticipant;
  amountMinor: number;
}

export interface TripExpense {
  id: string;
  title: string;
  category: TripExpenseCategory;
  spentOn: string;
  currency: string;
  amountMinor: number;
  paidBy: ExpenseParticipant;
  splitMethod: TripExpenseSplitMethod;
  shares: TripExpenseShare[];
  reservationId: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EqualTripExpenseSplitRequest {
  method: "equal";
  participantUserIds: string[];
}

export interface CustomTripExpenseSplitRequest {
  method: "custom";
  shares: Array<{
    userId: string;
    amountMinor: number;
  }>;
}

export type TripExpenseSplitRequest =
  | EqualTripExpenseSplitRequest
  | CustomTripExpenseSplitRequest;

export interface CreateTripExpenseRequest {
  title: string;
  category: TripExpenseCategory;
  spentOn: string;
  currency: string;
  amountMinor: number;
  paidByUserId: string;
  reservationId?: string | null;
  notes?: string | null;
  split: TripExpenseSplitRequest;
}

export interface UpdateTripExpenseRequest {
  title?: string;
  category?: TripExpenseCategory;
  spentOn?: string;
  currency?: string;
  amountMinor?: number;
  paidByUserId?: string;
  reservationId?: string | null;
  notes?: string | null;
  split?: TripExpenseSplitRequest;
}

export interface ParticipantBalance {
  participant: ExpenseParticipant;
  netMinor: number;
}

export interface SuggestedSettlement {
  from: ExpenseParticipant;
  to: ExpenseParticipant;
  amountMinor: number;
}

export interface CurrencyBalance {
  currency: string;
  totalExpensesMinor: number;
  balances: ParticipantBalance[];
  settlements: SuggestedSettlement[];
}

export interface TripExpenseBalances {
  currencies: CurrencyBalance[];
}

let supportedCurrencyCodes: ReadonlySet<string> | undefined;

export function getSupportedCurrencyCodes(): readonly string[] {
  return [...supportedCurrencies()].sort();
}

export function normalizeCurrencyCode(currency: string): string {
  return currency.trim().toUpperCase();
}

export function isSupportedCurrency(currency: string): boolean {
  return supportedCurrencies().has(normalizeCurrencyCode(currency));
}

export function getCurrencyMinorUnitDigits(currency: string): number {
  const normalized = normalizeCurrencyCode(currency);
  if (!supportedCurrencies().has(normalized)) {
    throw new RangeError(`Unsupported currency: ${normalized}`);
  }

  const digits = new Intl.NumberFormat("en", {
    currency: normalized,
    style: "currency",
  }).resolvedOptions().maximumFractionDigits;
  if (digits === undefined) {
    throw new RangeError(`Currency metadata is unavailable: ${normalized}`);
  }
  return digits;
}

export function parseMajorAmountToMinor(
  value: string,
  currency: string,
): number | null {
  if (!isSupportedCurrency(currency) || !/^\d+(?:\.\d+)?$/.test(value)) {
    return null;
  }

  const digits = getCurrencyMinorUnitDigits(currency);
  const [whole = "", fraction = ""] = value.split(".");
  if (fraction.length > digits) return null;

  const scale = 10n ** BigInt(digits);
  const minor = BigInt(whole) * scale + BigInt(fraction.padEnd(digits, "0") || "0");
  if (minor > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return Number(minor);
}

export function formatMinorAmount(
  amountMinor: number,
  currency: string,
  locale?: string,
): string {
  if (!Number.isSafeInteger(amountMinor)) {
    throw new RangeError("Money amount must be a safe integer");
  }

  const normalized = normalizeCurrencyCode(currency);
  const digits = getCurrencyMinorUnitDigits(normalized);
  const scale = 10 ** digits;
  return new Intl.NumberFormat(locale, {
    currency: normalized,
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
    style: "currency",
  }).format(amountMinor / scale);
}

export function minorAmountToMajorString(
  amountMinor: number,
  currency: string,
): string {
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) {
    throw new RangeError("Money amount must be a non-negative safe integer");
  }
  const digits = getCurrencyMinorUnitDigits(currency);
  if (digits === 0) return String(amountMinor);
  const raw = String(amountMinor).padStart(digits + 1, "0");
  return `${raw.slice(0, -digits)}.${raw.slice(-digits)}`;
}

export function allocateEqualSplit(
  amountMinor: number,
  participantUserIds: readonly string[],
): Array<{ userId: string; amountMinor: number }> {
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) {
    throw new RangeError("Money amount must be a non-negative safe integer");
  }
  if (participantUserIds.length === 0) {
    throw new RangeError("At least one split participant is required");
  }

  const sorted = [...participantUserIds].sort((left, right) =>
    left.localeCompare(right, "en"),
  );
  const base = Math.floor(amountMinor / sorted.length);
  const remainder = amountMinor % sorted.length;

  return sorted.map((userId, index) => ({
    amountMinor: base + (index < remainder ? 1 : 0),
    userId,
  }));
}

function supportedCurrencies(): ReadonlySet<string> {
  supportedCurrencyCodes ??= new Set(Intl.supportedValuesOf("currency"));
  return supportedCurrencyCodes;
}

export const TRIP_DOCUMENT_CONTENT_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export const MAX_TRIP_DOCUMENT_SIZE_BYTES = 25 * 1024 * 1024;

export type TripDocumentContentType =
  (typeof TRIP_DOCUMENT_CONTENT_TYPES)[number];
export type TripDocumentKind =
  | "ticket"
  | "booking"
  | "receipt"
  | "image"
  | "other";
export type TripDocumentStatus = "pending" | "ready";
export type TripDocumentLink =
  | { type: "itinerary"; id: string }
  | { type: "reservation"; id: string }
  | { type: "expense"; id: string }
  | null;

export interface TripDocument {
  id: string;
  kind: TripDocumentKind;
  title: string;
  fileName: string;
  contentType: TripDocumentContentType;
  sizeBytes: number;
  status: TripDocumentStatus;
  link: TripDocumentLink;
  uploadedBy: ExpenseParticipant;
  createdAt: string;
  readyAt: string | null;
}

export interface CreateDocumentUploadRequest {
  kind: TripDocumentKind;
  title: string;
  fileName: string;
  contentType: TripDocumentContentType;
  sizeBytes: number;
  link?: TripDocumentLink;
}

export interface CreateDocumentUploadResponse {
  document: TripDocument;
  upload: {
    url: string;
    method: "PUT";
    headers: { "Content-Type": TripDocumentContentType };
    expiresAt: string;
  };
}

export interface TripDocumentDownload {
  url: string;
  expiresAt: string;
}

export interface UpdateTripDocumentRequest {
  kind?: TripDocumentKind;
  title?: string;
  link?: TripDocumentLink;
}
