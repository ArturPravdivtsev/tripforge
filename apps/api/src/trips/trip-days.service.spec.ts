import { describe, expect, it, vi } from "vitest";

import { TripDaysRepository } from "./trip-days.repository";
import { TripDaysService } from "./trip-days.service";
import { TripDestinationsRepository } from "./trip-destinations.repository";
import { TripPermissionsService } from "./trip-permissions.service";

describe("TripDaysService", () => {
  it("rejects a destination outside the accessible Trip", async () => {
    const days = { updateDestination: vi.fn() };
    const destinations = { exists: vi.fn().mockResolvedValue(false) };
    const permissions = { requireEditable: vi.fn().mockResolvedValue({}) };
    const service = new TripDaysService(
      days as unknown as TripDaysRepository,
      destinations as unknown as TripDestinationsRepository,
      permissions as unknown as TripPermissionsService,
    );

    await expect(
      service.updateDestination("editor", "trip-a", "day", "foreign"),
    ).rejects.toMatchObject({ response: { code: "DESTINATION_NOT_FOUND" } });
    expect(days.updateDestination).not.toHaveBeenCalled();
  });

  it("allows clearing a Day assignment", async () => {
    const day = { date: "2027-04-12", destinationId: null, id: "day" };
    const days = { updateDestination: vi.fn().mockResolvedValue(day) };
    const destinations = { exists: vi.fn() };
    const permissions = { requireEditable: vi.fn().mockResolvedValue({}) };
    const service = new TripDaysService(
      days as unknown as TripDaysRepository,
      destinations as unknown as TripDestinationsRepository,
      permissions as unknown as TripPermissionsService,
    );

    await expect(
      service.updateDestination("owner", "trip", "day", null),
    ).resolves.toEqual(day);
    expect(destinations.exists).not.toHaveBeenCalled();
  });
});
