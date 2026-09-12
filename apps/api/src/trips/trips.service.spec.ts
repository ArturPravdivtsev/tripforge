import type { Trip } from "@tripforge/contracts";
import { describe, expect, it, vi } from "vitest";

import { TripsRepository } from "./trips.repository";
import { TripsService } from "./trips.service";

const trip: Trip = {
  createdAt: "2026-09-12T10:00:00.000Z",
  endsOn: "2027-04-20",
  id: "00000000-0000-4000-8000-000000000001",
  name: "Japan 2027",
  startsOn: "2027-04-10",
  updatedAt: "2026-09-12T10:00:00.000Z",
};

function createSubject() {
  const repository = {
    create: vi.fn(),
    deleteOwned: vi.fn(),
    findOwnedById: vi.fn(),
    listOwned: vi.fn(),
    updateOwned: vi.fn(),
  };

  return {
    repository,
    service: new TripsService(repository as unknown as TripsRepository),
  };
}

describe("TripsService", () => {
  it("normalizes create input and preserves independently nullable dates", async () => {
    const { repository, service } = createSubject();
    repository.create.mockResolvedValue(trip);

    await service.create("user-1", {
      endsOn: null,
      name: "   Japan 2027   ",
      startsOn: "2027-04-12",
    });

    expect(repository.create).toHaveBeenCalledWith("user-1", {
      endsOn: null,
      name: "Japan 2027",
      startsOn: "2027-04-12",
    });
  });

  it("rejects invalid create ranges before persistence", async () => {
    const { repository, service } = createSubject();

    await expect(
      service.create("user-1", {
        endsOn: "2027-04-11",
        name: "Japan",
        startsOn: "2027-04-12",
      }),
    ).rejects.toMatchObject({ response: { code: "INVALID_TRIP_DATE_RANGE" } });
    expect(repository.create).not.toHaveBeenCalled();
  });

  it("validates a PATCH against the resulting stored date range", async () => {
    const { repository, service } = createSubject();
    repository.findOwnedById.mockResolvedValue(trip);

    await expect(
      service.update("user-1", trip.id, { startsOn: "2027-04-25" }),
    ).rejects.toMatchObject({ response: { code: "INVALID_TRIP_DATE_RANGE" } });
    expect(repository.updateOwned).not.toHaveBeenCalled();
  });

  it("distinguishes explicit null from an omitted PATCH field", async () => {
    const { repository, service } = createSubject();
    repository.findOwnedById.mockResolvedValue(trip);
    repository.updateOwned.mockResolvedValue({ ...trip, startsOn: null });

    await service.update("user-1", trip.id, { startsOn: null });

    expect(repository.updateOwned).toHaveBeenCalledWith("user-1", trip.id, {
      startsOn: null,
    });
  });

  it("rejects empty PATCH payloads", async () => {
    const { repository, service } = createSubject();

    await expect(service.update("user-1", trip.id, {})).rejects.toMatchObject({
      response: { code: "EMPTY_TRIP_UPDATE" },
    });
    expect(repository.findOwnedById).not.toHaveBeenCalled();
  });

  it("uses the same not-found error for failed reads and mutations", async () => {
    const { repository, service } = createSubject();
    repository.findOwnedById.mockResolvedValue(undefined);
    repository.deleteOwned.mockResolvedValue(false);

    await expect(service.get("user-1", trip.id)).rejects.toMatchObject({
      response: { code: "TRIP_NOT_FOUND" },
    });
    await expect(service.delete("user-1", trip.id)).rejects.toMatchObject({
      response: { code: "TRIP_NOT_FOUND" },
    });
  });

  it("calculates consistent empty and populated pagination metadata", async () => {
    const { repository, service } = createSubject();
    repository.listOwned
      .mockResolvedValueOnce({ items: [], total: 0 })
      .mockResolvedValueOnce({ items: [trip], total: 5 });

    await expect(service.list("user-1", 1, 20)).resolves.toMatchObject({
      page: 1,
      pageSize: 20,
      total: 0,
      totalPages: 0,
    });
    await expect(service.list("user-1", 2, 2)).resolves.toMatchObject({
      page: 2,
      pageSize: 2,
      total: 5,
      totalPages: 3,
    });
  });
});
