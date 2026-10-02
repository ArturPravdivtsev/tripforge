import { Injectable } from "@nestjs/common";
import type {
  AiProposalPayload,
  ItineraryItemKind,
} from "@tripforge/contracts";
import type { Responses } from "openai/resources/responses/responses";

import { ItineraryItemsService } from "../trips/itinerary-items.service";
import { TripDaysService } from "../trips/trip-days.service";
import { TripDestinationsService } from "../trips/trip-destinations.service";
import { TripDocumentsService } from "../trips/trip-documents.service";
import { TripExpensesService } from "../trips/trip-expenses.service";
import { TripReservationsService } from "../trips/trip-reservations.service";
import { TripRoutesService } from "../trips/trip-routes.service";
import { TripSearchService } from "../trips/trip-search.service";
import { TripsService } from "../trips/trips.service";

const ITEM_KINDS = [
  "activity",
  "food",
  "transport",
  "accommodation",
  "other",
] as const;
const RESERVATION_KINDS = [
  "accommodation",
  "transport",
  "restaurant",
  "activity",
  "other",
] as const;

const nullableString = { type: ["string", "null"] } as const;
const dateOrNull = {
  anyOf: [{ format: "date", type: "string" }, { type: "null" }],
} as const;
const timeOrNull = {
  anyOf: [
    { pattern: "^(?:[01]\\d|2[0-3]):[0-5]\\d$", type: "string" },
    { type: "null" },
  ],
} as const;

export const AI_TOOLS: Responses.FunctionTool[] = [
  tool("get_trip_overview", "Get high-level information about the authorized Trip.", {}, []),
  tool(
    "get_trip_days",
    "Get at most 14 authorized Trip days and their destinations.",
    { endDate: dateOrNull, limit: { maximum: 14, minimum: 1, type: "integer" }, startDate: dateOrNull },
    ["startDate", "endDate", "limit"],
  ),
  tool(
    "get_itinerary",
    "Get at most 100 itinerary items for bounded days or dates.",
    {
      dayIds: { items: { format: "uuid", type: "string" }, maxItems: 14, type: "array" },
      endDate: dateOrNull,
      limit: { maximum: 100, minimum: 1, type: "integer" },
      startDate: dateOrNull,
    },
    ["dayIds", "startDate", "endDate", "limit"],
  ),
  tool(
    "search_trip",
    "Search authorized Trip data using TripForge search semantics.",
    { query: { maxLength: 100, minLength: 2, type: "string" } },
    ["query"],
  ),
  tool(
    "get_reservations",
    "Get bounded reservation planning data. Confirmation codes are never returned.",
    {
      endDate: dateOrNull,
      kind: { enum: [...RESERVATION_KINDS, null], type: ["string", "null"] },
      limit: { maximum: 50, minimum: 1, type: "integer" },
      startDate: dateOrNull,
    },
    ["startDate", "endDate", "kind", "limit"],
  ),
  tool("get_expense_summary", "Get authoritative aggregate expense totals and balances.", {}, []),
  tool(
    "get_documents",
    "Get bounded document metadata only, never file contents or storage data.",
    { limit: { maximum: 50, minimum: 1, type: "integer" } },
    ["limit"],
  ),
  tool(
    "get_routes",
    "Get bounded persisted route summaries without route geometry.",
    { limit: { maximum: 50, minimum: 1, type: "integer" } },
    ["limit"],
  ),
  tool(
    "propose_itinerary_create",
    "Draft an itinerary item to append to a known Trip day. Does not mutate the Trip.",
    {
      dayId: { format: "uuid", type: "string" },
      endTime: timeOrNull,
      kind: { enum: ITEM_KINDS, type: "string" },
      notes: nullableString,
      startTime: timeOrNull,
      title: { maxLength: 200, minLength: 1, type: "string" },
    },
    ["dayId", "kind", "title", "startTime", "endTime", "notes"],
  ),
  tool(
    "propose_itinerary_update",
    "Draft allowed field changes for a known itinerary item. Does not move or mutate it.",
    {
      endTime: timeOrNull,
      fields: {
        items: { enum: ["kind", "title", "startTime", "endTime", "notes"], type: "string" },
        maxItems: 5,
        minItems: 1,
        type: "array",
      },
      itemId: { format: "uuid", type: "string" },
      kind: { enum: [...ITEM_KINDS, null], type: ["string", "null"] },
      notes: nullableString,
      startTime: timeOrNull,
      title: nullableString,
    },
    ["itemId", "fields", "kind", "title", "startTime", "endTime", "notes"],
  ),
  tool(
    "propose_itinerary_move",
    "Draft moving a known itinerary item using TripForge reorder positions.",
    {
      itemId: { format: "uuid", type: "string" },
      targetDayId: { format: "uuid", type: "string" },
      targetPosition: { minimum: 0, type: "integer" },
    },
    ["itemId", "targetDayId", "targetPosition"],
  ),
];

type ToolContext = Readonly<{ tripId: string; userId: string }>;
export type ToolExecution = Readonly<{
  output: string;
  proposal?: AiProposalPayload;
  status: string;
}>;

@Injectable()
export class AiToolRegistry {
  constructor(
    private readonly trips: TripsService,
    private readonly destinations: TripDestinationsService,
    private readonly days: TripDaysService,
    private readonly itinerary: ItineraryItemsService,
    private readonly search: TripSearchService,
    private readonly reservations: TripReservationsService,
    private readonly expenses: TripExpensesService,
    private readonly documents: TripDocumentsService,
    private readonly routes: TripRoutesService,
  ) {}

  async execute(
    name: string,
    rawArguments: string,
    context: ToolContext,
  ): Promise<ToolExecution> {
    const args = parseObject(rawArguments);
    switch (name) {
      case "get_trip_overview": {
        assertExactKeys(args, []);
        const [trip, destinations, days] = await Promise.all([
          this.trips.get(context.userId, context.tripId),
          this.destinations.list(context.userId, context.tripId),
          this.days.list(context.userId, context.tripId),
        ]);
        return result("Reviewing trip…", {
          dateRange: { endsOn: trip.endsOn, startsOn: trip.startsOn },
          destinations: destinations.map(({ id, name }) => ({ id, name })),
          numberOfDays: days.length,
          role: trip.accessRole,
          tripName: trip.name,
        });
      }
      case "get_trip_days": {
        assertExactKeys(args, ["startDate", "endDate", "limit"]);
        const startDate = optionalDate(args.startDate);
        const endDate = optionalDate(args.endDate);
        const limit = integer(args.limit, 1, 14);
        const [days, destinations] = await Promise.all([
          this.days.list(context.userId, context.tripId),
          this.destinations.list(context.userId, context.tripId),
        ]);
        const names = new Map(destinations.map(({ id, name }) => [id, name]));
        return result("Checking trip days…", days
          .filter((day) => inDateRange(day.date, startDate, endDate))
          .slice(0, limit)
          .map((day) => ({ ...day, destination: day.destinationId ? names.get(day.destinationId) ?? null : null })));
      }
      case "get_itinerary": {
        assertExactKeys(args, ["dayIds", "startDate", "endDate", "limit"]);
        const dayIds = uuidArray(args.dayIds, 14);
        const startDate = optionalDate(args.startDate);
        const endDate = optionalDate(args.endDate);
        const limit = integer(args.limit, 1, 100);
        const [days, items] = await Promise.all([
          this.days.list(context.userId, context.tripId),
          this.itinerary.list(context.userId, context.tripId),
        ]);
        const allowedDays = new Map(
          days
            .filter((day) =>
              (dayIds.length === 0 || dayIds.includes(day.id)) &&
              inDateRange(day.date, startDate, endDate),
            )
            .map((day) => [day.id, day.date]),
        );
        return result("Checking your itinerary…", items
          .filter(({ dayId }) => allowedDays.has(dayId))
          .slice(0, limit)
          .map((item) => ({
            date: allowedDays.get(item.dayId),
            dayId: item.dayId,
            endTime: item.endTime,
            id: item.id,
            kind: item.kind,
            notes: item.notes,
            place: item.place
              ? { address: item.place.address, name: item.place.name }
              : null,
            position: item.position,
            startTime: item.startTime,
            title: item.title,
          })));
      }
      case "search_trip": {
        assertExactKeys(args, ["query"]);
        const query = boundedString(args.query, 2, 100);
        const output = await this.search.search(context.userId, context.tripId, {
          limit: "10",
          q: query,
          types: undefined,
        });
        return result("Searching this trip…", output);
      }
      case "get_reservations": {
        assertExactKeys(args, ["startDate", "endDate", "kind", "limit"]);
        const startDate = optionalDate(args.startDate);
        const endDate = optionalDate(args.endDate);
        const kind = optionalEnum(args.kind, RESERVATION_KINDS);
        const limit = integer(args.limit, 1, 50);
        const reservations = await this.reservations.list(context.userId, context.tripId);
        return result("Reviewing reservations…", reservations
          .filter((reservation) =>
            inDateRange(reservation.startDate, startDate, endDate) &&
            (kind === null || reservation.kind === kind),
          )
          .slice(0, limit)
          .map((reservation) => ({
            endDate: reservation.endDate,
            endTime: reservation.endTime,
            id: reservation.id,
            itineraryItemId: reservation.itineraryItemId,
            kind: reservation.kind,
            locationName: reservation.locationName,
            notes: reservation.notes,
            providerName: reservation.providerName,
            startDate: reservation.startDate,
            startTime: reservation.startTime,
            status: reservation.status,
            title: reservation.title,
            transport: reservation.transport,
          })));
      }
      case "get_expense_summary": {
        assertExactKeys(args, []);
        return result(
          "Summarizing expenses…",
          await this.expenses.balances(context.userId, context.tripId),
        );
      }
      case "get_documents": {
        assertExactKeys(args, ["limit"]);
        const limit = integer(args.limit, 1, 50);
        const documents = await this.documents.list(context.userId, context.tripId);
        return result("Reviewing document metadata…", documents.slice(0, limit).map((document) => ({
          id: document.id,
          kind: document.kind,
          link: document.link,
          ready: document.status === "ready",
          title: document.title,
        })));
      }
      case "get_routes": {
        assertExactKeys(args, ["limit"]);
        const limit = integer(args.limit, 1, 50);
        const [routes, items] = await Promise.all([
          this.routes.list(context.userId, context.tripId),
          this.itinerary.list(context.userId, context.tripId),
        ]);
        const titles = new Map(items.map(({ id, title }) => [id, title]));
        return result("Reviewing saved routes…", routes.slice(0, limit).map((route) => ({
          destination: titles.get(route.toItemId) ?? "Unknown itinerary item",
          distanceMeters: route.distanceMeters,
          durationSeconds: route.durationSeconds,
          mode: route.mode,
          origin: titles.get(route.fromItemId) ?? "Unknown itinerary item",
        })));
      }
      case "propose_itinerary_create": {
        assertExactKeys(args, ["dayId", "kind", "title", "startTime", "endTime", "notes"]);
        const proposal: AiProposalPayload = {
          dayId: uuid(args.dayId),
          endTime: optionalTime(args.endTime),
          kind: enumValue(args.kind, ITEM_KINDS),
          notes: optionalBoundedString(args.notes, 5000),
          startTime: optionalTime(args.startTime),
          title: boundedString(args.title, 1, 200),
          type: "itinerary_create",
        };
        await assertReferences(proposal, context, this.days, this.itinerary);
        return proposalResult("Drafting an itinerary addition…", proposal);
      }
      case "propose_itinerary_update": {
        assertExactKeys(args, ["itemId", "fields", "kind", "title", "startTime", "endTime", "notes"]);
        const fields = stringArray(args.fields, ["kind", "title", "startTime", "endTime", "notes"] as const, 5);
        const changes: {
          kind?: ItineraryItemKind;
          title?: string;
          startTime?: string | null;
          endTime?: string | null;
          notes?: string | null;
        } = {};
        if (fields.includes("kind")) changes.kind = enumValue(args.kind, ITEM_KINDS);
        if (fields.includes("title")) changes.title = boundedString(args.title, 1, 200);
        if (fields.includes("startTime")) changes.startTime = optionalTime(args.startTime);
        if (fields.includes("endTime")) changes.endTime = optionalTime(args.endTime);
        if (fields.includes("notes")) changes.notes = optionalBoundedString(args.notes, 5000);
        const proposal: AiProposalPayload = {
          changes,
          itemId: uuid(args.itemId),
          type: "itinerary_update",
        };
        await assertReferences(proposal, context, this.days, this.itinerary);
        return proposalResult("Drafting an itinerary update…", proposal);
      }
      case "propose_itinerary_move": {
        assertExactKeys(args, ["itemId", "targetDayId", "targetPosition"]);
        const proposal: AiProposalPayload = {
          itemId: uuid(args.itemId),
          targetDayId: uuid(args.targetDayId),
          targetPosition: integer(args.targetPosition, 0, 1000),
          type: "itinerary_move",
        };
        await assertReferences(proposal, context, this.days, this.itinerary);
        return proposalResult("Drafting an itinerary move…", proposal);
      }
      default:
        throw new AiToolValidationError("Unknown tool");
    }
  }
}

function tool(
  name: string,
  description: string,
  properties: Record<string, unknown>,
  required: string[],
): Responses.FunctionTool {
  return {
    description,
    name,
    parameters: { additionalProperties: false, properties, required, type: "object" },
    strict: true,
    type: "function",
  };
}

function result(status: string, value: unknown): ToolExecution {
  return { output: JSON.stringify({ ok: true, value }), status };
}

function proposalResult(status: string, proposal: AiProposalPayload): ToolExecution {
  return {
    output: JSON.stringify({ ok: true, proposalDrafted: true, type: proposal.type }),
    proposal,
    status,
  };
}

async function assertReferences(
  proposal: AiProposalPayload,
  context: ToolContext,
  daysService: TripDaysService,
  itineraryService: ItineraryItemsService,
): Promise<void> {
  const [days, items] = await Promise.all([
    daysService.list(context.userId, context.tripId),
    itineraryService.list(context.userId, context.tripId),
  ]);
  if (proposal.type === "itinerary_create" && !days.some(({ id }) => id === proposal.dayId)) {
    throw new AiToolValidationError("Referenced day does not exist in this Trip");
  }
  if (proposal.type !== "itinerary_create" && !items.some(({ id }) => id === proposal.itemId)) {
    throw new AiToolValidationError("Referenced item does not exist in this Trip");
  }
  if (proposal.type === "itinerary_move" && !days.some(({ id }) => id === proposal.targetDayId)) {
    throw new AiToolValidationError("Target day does not exist in this Trip");
  }
}

function parseObject(raw: string): Record<string, unknown> {
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new AiToolValidationError("Invalid JSON arguments"); }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AiToolValidationError("Arguments must be an object");
  }
  return value as Record<string, unknown>;
}

function assertExactKeys(value: Record<string, unknown>, keys: readonly string[]): void {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new AiToolValidationError("Arguments contain missing or unsupported fields");
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const DATE = /^\d{4}-\d{2}-\d{2}$/u;
const TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/u;

function uuid(value: unknown): string {
  if (typeof value !== "string" || !UUID.test(value)) throw new AiToolValidationError("Invalid UUID");
  return value;
}
function optionalDate(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || !DATE.test(value)) throw new AiToolValidationError("Invalid date");
  return value;
}
function optionalTime(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || !TIME.test(value)) throw new AiToolValidationError("Invalid time");
  return value;
}
function boundedString(value: unknown, min: number, max: number): string {
  if (typeof value !== "string") throw new AiToolValidationError("Expected string");
  const normalized = value.trim();
  if (normalized.length < min || normalized.length > max) throw new AiToolValidationError("String length is invalid");
  return normalized;
}
function optionalBoundedString(value: unknown, max: number): string | null {
  if (value === null) return null;
  return boundedString(value, 1, max);
}
function integer(value: unknown, min: number, max: number): number {
  if (!Number.isInteger(value) || (value as number) < min || (value as number) > max) throw new AiToolValidationError("Integer is out of range");
  return value as number;
}
function uuidArray(value: unknown, max: number): string[] {
  if (!Array.isArray(value) || value.length > max) throw new AiToolValidationError("Invalid UUID array");
  return value.map(uuid);
}
function enumValue<T extends string>(value: unknown, allowed: readonly T[]): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) throw new AiToolValidationError("Invalid enum value");
  return value as T;
}
function optionalEnum<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return value === null ? null : enumValue(value, allowed);
}
function stringArray<T extends string>(value: unknown, allowed: readonly T[], max: number): T[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > max) throw new AiToolValidationError("Invalid field list");
  const result = value.map((entry) => enumValue(entry, allowed));
  if (new Set(result).size !== result.length) throw new AiToolValidationError("Duplicate fields are not allowed");
  return result;
}
function inDateRange(date: string, start: string | null, end: string | null): boolean {
  return (start === null || date >= start) && (end === null || date <= end);
}

export class AiToolValidationError extends Error {}
