import { describe, expect, it, vi } from "vitest";

import { ItineraryItemsService } from "../trips/itinerary-items.service";
import { TripDaysService } from "../trips/trip-days.service";
import { TripDestinationsService } from "../trips/trip-destinations.service";
import { TripDocumentsService } from "../trips/trip-documents.service";
import { TripExpensesService } from "../trips/trip-expenses.service";
import { TripReservationsService } from "../trips/trip-reservations.service";
import { TripRoutesService } from "../trips/trip-routes.service";
import { TripSearchService } from "../trips/trip-search.service";
import { TripsService } from "../trips/trips.service";
import { AiToolRegistry, AiToolValidationError } from "./ai-tool-registry";

const tripId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const dayId = "33333333-3333-4333-8333-333333333333";
const itemId = "44444444-4444-4444-8444-444444444444";

function createSubject() {
  const services = {
    days: { list: vi.fn().mockResolvedValue([{ date: "2027-04-12", destinationId: null, id: dayId }]) },
    destinations: { list: vi.fn().mockResolvedValue([]) },
    documents: { list: vi.fn().mockResolvedValue([]) },
    expenses: { balances: vi.fn().mockResolvedValue({ currencies: [] }) },
    itinerary: { list: vi.fn().mockResolvedValue([]) },
    reservations: { list: vi.fn().mockResolvedValue([]) },
    routes: { list: vi.fn().mockResolvedValue([]) },
    search: { search: vi.fn().mockResolvedValue({ query: "Kyoto", results: [] }) },
    trips: {
      get: vi.fn().mockResolvedValue({
        accessRole: "editor",
        endsOn: "2027-04-13",
        name: "Japan",
        startsOn: "2027-04-12",
      }),
    },
  };
  return {
    registry: new AiToolRegistry(
      services.trips as unknown as TripsService,
      services.destinations as unknown as TripDestinationsService,
      services.days as unknown as TripDaysService,
      services.itinerary as unknown as ItineraryItemsService,
      services.search as unknown as TripSearchService,
      services.reservations as unknown as TripReservationsService,
      services.expenses as unknown as TripExpensesService,
      services.documents as unknown as TripDocumentsService,
      services.routes as unknown as TripRoutesService,
    ),
    services,
  };
}

describe("AiToolRegistry", () => {
  it("injects authorized identity into the existing Trip search service", async () => {
    const { registry, services } = createSubject();

    await registry.execute("search_trip", JSON.stringify({ query: " Kyoto " }), { tripId, userId });

    expect(services.search.search).toHaveBeenCalledWith(userId, tripId, {
      limit: "10",
      q: "Kyoto",
      types: undefined,
    });
  });

  it("bounds itinerary output to 100 minimal records", async () => {
    const { registry, services } = createSubject();
    services.itinerary.list.mockResolvedValue(
      Array.from({ length: 120 }, (_, position) => ({
        dayId,
        endTime: null,
        id: `${String(position).padStart(8, "0")}-0000-4000-8000-000000000000`,
        kind: "activity",
        notes: null,
        place: null,
        position,
        startTime: null,
        title: `Item ${position}`,
      })),
    );

    const execution = await registry.execute(
      "get_itinerary",
      JSON.stringify({ dayIds: [], endDate: null, limit: 100, startDate: null }),
      { tripId, userId },
    );
    const output = JSON.parse(execution.output) as { value: unknown[] };

    expect(output.value).toHaveLength(100);
  });

  it("excludes reservation confirmation codes and document storage data", async () => {
    const { registry, services } = createSubject();
    services.reservations.list.mockResolvedValue([
      {
        confirmationCode: "SECRET-123",
        endDate: null,
        endTime: null,
        id: itemId,
        itineraryItemId: null,
        kind: "activity",
        locationName: "Museum",
        notes: null,
        providerName: null,
        startDate: "2027-04-12",
        startTime: "09:00",
        status: "confirmed",
        title: "Museum ticket",
        transport: null,
      },
    ]);
    services.documents.list.mockResolvedValue([
      {
        eTag: "etag",
        id: itemId,
        kind: "ticket",
        link: null,
        status: "ready",
        storageKey: "private/key.pdf",
        title: "Museum ticket",
        url: "https://example.invalid/presigned",
      },
    ]);

    const reservation = await registry.execute(
      "get_reservations",
      JSON.stringify({ endDate: null, kind: null, limit: 50, startDate: null }),
      { tripId, userId },
    );
    const document = await registry.execute(
      "get_documents",
      JSON.stringify({ limit: 50 }),
      { tripId, userId },
    );

    expect(reservation.output).not.toContain("SECRET-123");
    expect(document.output).not.toContain("private/key.pdf");
    expect(document.output).not.toContain("presigned");
    expect(document.output).not.toContain("etag");
  });

  it("rejects malformed or extra arguments before calling domain services", async () => {
    const { registry, services } = createSubject();

    await expect(
      registry.execute(
        "propose_itinerary_create",
        JSON.stringify({
          dayId,
          endTime: null,
          kind: "activity",
          notes: null,
          place: { name: "Hallucinated" },
          startTime: null,
          title: "Museum",
        }),
        { tripId, userId },
      ),
    ).rejects.toBeInstanceOf(AiToolValidationError);
    expect(services.days.list).not.toHaveBeenCalled();
    expect(services.itinerary.list).not.toHaveBeenCalled();
  });

  it("validates proposal references in the authorized Trip and returns only a draft", async () => {
    const { registry, services } = createSubject();
    services.itinerary.list.mockResolvedValue([{ id: itemId }]);

    const execution = await registry.execute(
      "propose_itinerary_move",
      JSON.stringify({ itemId, targetDayId: dayId, targetPosition: 0 }),
      { tripId, userId },
    );

    expect(execution.proposal).toEqual({
      itemId,
      targetDayId: dayId,
      targetPosition: 0,
      type: "itinerary_move",
    });
    expect(services.days.list).toHaveBeenCalledWith(userId, tripId);
    expect(services.itinerary.list).toHaveBeenCalledWith(userId, tripId);
  });
});
