import { describe, expect, it, vi } from "vitest";

import { TripDestinationsRepository } from "./trip-destinations.repository";
import {
  isCompleteDestinationOrder,
  isValidDestinationCoordinateUpdate,
  TripDestinationsService,
} from "./trip-destinations.service";
import { TripPermissionsService } from "./trip-permissions.service";

describe("TripDestinationsService", () => {
  it("validates complete destination order sets", () => {
    expect(isCompleteDestinationOrder(["a", "b"], ["b", "a"])).toBe(true);
    expect(isCompleteDestinationOrder(["a", "b"], ["a", "a"])).toBe(false);
    expect(isCompleteDestinationOrder(["a", "b"], ["a"])).toBe(false);
    expect(isCompleteDestinationOrder(["a", "b"], ["a", "c"])).toBe(false);
  });

  it("validates coordinate pair presence, null clearing, finiteness, and ranges", () => {
    expect(isValidDestinationCoordinateUpdate({})).toBe(true);
    expect(
      isValidDestinationCoordinateUpdate({ latitude: 35.6762, longitude: 139.6503 }),
    ).toBe(true);
    expect(
      isValidDestinationCoordinateUpdate({ latitude: null, longitude: null }),
    ).toBe(true);
    expect(isValidDestinationCoordinateUpdate({ latitude: 35.6762 })).toBe(false);
    expect(isValidDestinationCoordinateUpdate({ longitude: 139.6503 })).toBe(false);
    expect(
      isValidDestinationCoordinateUpdate({ latitude: null, longitude: 139.6503 }),
    ).toBe(false);
    expect(
      isValidDestinationCoordinateUpdate({ latitude: 91, longitude: 139.6503 }),
    ).toBe(false);
    expect(
      isValidDestinationCoordinateUpdate({ latitude: 35.6762, longitude: -181 }),
    ).toBe(false);
    expect(
      isValidDestinationCoordinateUpdate({
        latitude: Number.NaN,
        longitude: Number.POSITIVE_INFINITY,
      }),
    ).toBe(false);
  });

  it("preserves PATCH field presence and normalizes a supplied name", async () => {
    const repository = {
      update: vi.fn().mockResolvedValue({ id: "tokyo" }),
    };
    const permissions = { requireEditable: vi.fn().mockResolvedValue({}) };
    const service = new TripDestinationsService(
      repository as unknown as TripDestinationsRepository,
      permissions as unknown as TripPermissionsService,
    );

    await service.update("editor", "trip", "tokyo", {
      latitude: 35.6762,
      longitude: 139.6503,
    });
    await service.update("editor", "trip", "tokyo", { name: "  Tokyo  " });
    await service.update("editor", "trip", "tokyo", {
      latitude: null,
      longitude: null,
    });

    expect(repository.update).toHaveBeenNthCalledWith(1, "trip", "tokyo", {
      latitude: 35.6762,
      longitude: 139.6503,
    });
    expect(repository.update).toHaveBeenNthCalledWith(2, "trip", "tokyo", {
      name: "Tokyo",
    });
    expect(repository.update).toHaveBeenNthCalledWith(3, "trip", "tokyo", {
      latitude: null,
      longitude: null,
    });
  });

  it("rejects an invalid coordinate PATCH before persistence", async () => {
    const repository = { update: vi.fn() };
    const permissions = { requireEditable: vi.fn().mockResolvedValue({}) };
    const service = new TripDestinationsService(
      repository as unknown as TripDestinationsRepository,
      permissions as unknown as TripPermissionsService,
    );

    await expect(
      service.update("editor", "trip", "tokyo", { latitude: 35.6762 }),
    ).rejects.toMatchObject({
      response: { code: "INVALID_DESTINATION_COORDINATES" },
    });
    expect(repository.update).not.toHaveBeenCalled();
  });

  it("authorizes edits before creating a destination", async () => {
    const repository = { create: vi.fn().mockResolvedValue({ id: "tokyo" }) };
    const permissions = { requireEditable: vi.fn().mockResolvedValue({}) };
    const service = new TripDestinationsService(
      repository as unknown as TripDestinationsRepository,
      permissions as unknown as TripPermissionsService,
    );

    await service.create("editor", "trip", "  Tokyo  ");

    expect(permissions.requireEditable).toHaveBeenCalledWith("editor", "trip");
    expect(repository.create).toHaveBeenCalledWith("trip", "Tokyo");
  });

  it("rejects incomplete reorder sets before persistence", async () => {
    const repository = {
      list: vi.fn().mockResolvedValue([{ id: "tokyo" }, { id: "kyoto" }]),
      reorder: vi.fn(),
    };
    const permissions = { requireEditable: vi.fn().mockResolvedValue({}) };
    const service = new TripDestinationsService(
      repository as unknown as TripDestinationsRepository,
      permissions as unknown as TripPermissionsService,
    );

    await expect(
      service.reorder("owner", "trip", ["tokyo"]),
    ).rejects.toMatchObject({
      response: { code: "INVALID_DESTINATION_ORDER" },
    });
    expect(repository.reorder).not.toHaveBeenCalled();
  });
});
