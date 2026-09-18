import { describe, expect, it, vi } from "vitest";
import type { TripReservation } from "@tripforge/contracts";

import { TripPermissionsService } from "./trip-permissions.service";
import { TripReservationsRepository } from "./trip-reservations.repository";
import { TripReservationsService } from "./trip-reservations.service";

const reservation: TripReservation = {
  confirmationCode: null,
  createdAt: "2027-01-01T00:00:00.000Z",
  endDate: null,
  endTime: null,
  id: "reservation",
  itineraryItemId: null,
  kind: "restaurant",
  locationName: null,
  notes: null,
  providerName: null,
  startDate: "2027-04-14",
  startTime: "19:30",
  status: "confirmed",
  title: "Dinner",
  transport: null,
  updatedAt: "2027-01-01T00:00:00.000Z",
};

function subject(existing: TripReservation | undefined = reservation) {
  const repository = {
    create: vi.fn(async (_tripId, state) => ({ ...reservation, ...state })),
    delete: vi.fn().mockResolvedValue(true),
    find: vi.fn().mockResolvedValue(existing),
    itineraryItemBelongsToTrip: vi.fn().mockResolvedValue(true),
    list: vi.fn().mockResolvedValue([reservation]),
    update: vi.fn(async (_tripId, _reservationId, state) => ({
      ...reservation,
      ...state,
    })),
  };
  const permissions = {
    requireEditable: vi.fn().mockResolvedValue({}),
    requireReadable: vi.fn().mockResolvedValue({}),
  };
  return {
    permissions,
    repository,
    service: new TripReservationsService(
      repository as unknown as TripReservationsRepository,
      permissions as unknown as TripPermissionsService,
    ),
  };
}

describe("TripReservationsService", () => {
  it("normalizes nullable text and validates a scoped itinerary link", async () => {
    const { repository, service } = subject();
    await service.create("editor", "trip", {
      confirmationCode: "  ABC123  ",
      itineraryItemId: "item",
      kind: "accommodation",
      notes: "   ",
      providerName: " Booking.com ",
      startDate: "2027-04-12",
      status: "confirmed",
      title: "  Hotel  ",
    });

    expect(repository.itineraryItemBelongsToTrip).toHaveBeenCalledWith(
      "trip",
      "item",
    );
    expect(repository.create).toHaveBeenCalledWith(
      "trip",
      expect.objectContaining({
        confirmationCode: "ABC123",
        notes: null,
        providerName: "Booking.com",
        title: "Hotel",
      }),
    );
  });

  it("enforces transport details against the resulting kind", async () => {
    const { service } = subject();
    await expect(
      service.create("owner", "trip", {
        kind: "transport",
        startDate: "2027-04-14",
        status: "pending",
        title: "Train",
      }),
    ).rejects.toMatchObject({
      response: { code: "INVALID_RESERVATION_DETAILS" },
    });
    await expect(
      service.create("owner", "trip", {
        kind: "restaurant",
        startDate: "2027-04-14",
        status: "pending",
        title: "Dinner",
        transport: {
          destinationName: "Kyoto",
          mode: "train",
          operatorName: null,
          originName: "Tokyo",
          serviceNumber: null,
        },
      }),
    ).rejects.toMatchObject({
      response: { code: "INVALID_RESERVATION_DETAILS" },
    });
  });

  it("validates local schedule ranges without Date conversion", async () => {
    const { service } = subject();
    await expect(
      service.create("owner", "trip", {
        endDate: "2027-04-14",
        endTime: "08:00",
        kind: "activity",
        startDate: "2027-04-14",
        startTime: "09:00",
        status: "confirmed",
        title: "Tour",
      }),
    ).rejects.toMatchObject({
      response: { code: "INVALID_RESERVATION_SCHEDULE" },
    });
  });

  it("validates merged PATCH state and handles subtype kind switches", async () => {
    const { repository, service } = subject();
    await service.update("owner", "trip", reservation.id, {
      kind: "transport",
      transport: {
        destinationName: "Kyoto Station",
        mode: "train",
        operatorName: " JR Central ",
        originName: "Tokyo Station",
        serviceNumber: " Nozomi 215 ",
      },
    });
    expect(repository.update).toHaveBeenCalledWith(
      "trip",
      reservation.id,
      expect.objectContaining({
        kind: "transport",
        transport: expect.objectContaining({ operatorName: "JR Central" }),
      }),
    );

    await expect(
      service.update("owner", "trip", reservation.id, { kind: "transport" }),
    ).rejects.toMatchObject({
      response: { code: "INVALID_RESERVATION_DETAILS" },
    });
  });

  it("removes transport details when switching to a common kind", async () => {
    const transport: TripReservation = {
      ...reservation,
      kind: "transport",
      transport: {
        destinationName: "Kyoto",
        mode: "train",
        operatorName: null,
        originName: "Tokyo",
        serviceNumber: null,
      },
    };
    const { repository, service } = subject(transport);
    await service.update("owner", "trip", reservation.id, { kind: "activity" });
    expect(repository.update).toHaveBeenCalledWith(
      "trip",
      reservation.id,
      expect.objectContaining({ kind: "activity", transport: null }),
    );
  });

  it("rejects empty PATCH and foreign itinerary links with stable codes", async () => {
    const { repository, service } = subject();
    await expect(
      service.update("owner", "trip", reservation.id, {}),
    ).rejects.toMatchObject({ response: { code: "EMPTY_RESERVATION_UPDATE" } });

    repository.itineraryItemBelongsToTrip.mockResolvedValue(false);
    await expect(
      service.update("owner", "trip", reservation.id, {
        itineraryItemId: "foreign",
      }),
    ).rejects.toMatchObject({ response: { code: "ITINERARY_ITEM_NOT_FOUND" } });
  });

  it("checks permission before repository mutations", async () => {
    const { permissions, repository, service } = subject();
    permissions.requireEditable.mockRejectedValue(new Error("forbidden"));
    await expect(service.delete("viewer", "trip", reservation.id)).rejects.toThrow(
      "forbidden",
    );
    expect(repository.delete).not.toHaveBeenCalled();
  });
});
