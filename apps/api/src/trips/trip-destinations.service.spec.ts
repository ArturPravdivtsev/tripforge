import { describe, expect, it, vi } from "vitest";

import { TripDestinationsRepository } from "./trip-destinations.repository";
import {
  isCompleteDestinationOrder,
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
