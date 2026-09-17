import { describe, expect, it, vi } from "vitest";

import { ItineraryItemsRepository } from "./itinerary-items.repository";
import {
  hasValidItineraryOrderStructure,
  ItineraryItemsService,
  normalizeItineraryNotes,
} from "./itinerary-items.service";
import { TripPermissionsService } from "./trip-permissions.service";

function createSubject() {
  const repository = {
    create: vi.fn(),
    delete: vi.fn(),
    list: vi.fn(),
    reorder: vi.fn(),
    update: vi.fn(),
  };
  const permissions = {
    requireEditable: vi.fn().mockResolvedValue({}),
    requireReadable: vi.fn().mockResolvedValue({}),
  };

  return {
    permissions,
    repository,
    service: new ItineraryItemsService(
      repository as unknown as ItineraryItemsRepository,
      permissions as unknown as TripPermissionsService,
    ),
  };
}

describe("ItineraryItemsService", () => {
  it("normalizes optional notes", () => {
    expect(normalizeItineraryNotes("  Meet at the gate  ")).toBe(
      "Meet at the gate",
    );
    expect(normalizeItineraryNotes("   ")).toBeNull();
    expect(normalizeItineraryNotes(null)).toBeNull();
  });

  it("validates duplicate Days and items in reorder payloads", () => {
    expect(
      hasValidItineraryOrderStructure([
        { dayId: "day-a", itemIds: ["a"] },
        { dayId: "day-b", itemIds: ["b"] },
      ]),
    ).toBe(true);
    expect(hasValidItineraryOrderStructure([])).toBe(false);
    expect(
      hasValidItineraryOrderStructure([
        { dayId: "day-a", itemIds: [] },
        { dayId: "day-a", itemIds: [] },
      ]),
    ).toBe(false);
    expect(
      hasValidItineraryOrderStructure([
        { dayId: "day-a", itemIds: ["a"] },
        { dayId: "day-b", itemIds: ["a"] },
      ]),
    ).toBe(false);
  });

  it("authorizes and normalizes item creation", async () => {
    const { permissions, repository, service } = createSubject();
    repository.create.mockResolvedValue({ id: "item" });

    await service.create("editor", "trip", {
      dayId: "day",
      kind: "activity",
      notes: "  Visit early  ",
      startTime: "09:00",
      title: "  Senso-ji  ",
    });

    expect(permissions.requireEditable).toHaveBeenCalledWith("editor", "trip");
    expect(repository.create).toHaveBeenCalledWith("trip", {
      dayId: "day",
      kind: "activity",
      notes: "Visit early",
      startTime: "09:00",
      title: "Senso-ji",
    });
  });

  it("rejects empty updates before persistence", async () => {
    const { repository, service } = createSubject();

    await expect(service.update("owner", "trip", "item", {})).rejects.toMatchObject({
      response: { code: "EMPTY_ITINERARY_ITEM_UPDATE" },
    });
    expect(repository.update).not.toHaveBeenCalled();
  });

  it("rejects structurally invalid reorder before persistence", async () => {
    const { repository, service } = createSubject();

    await expect(
      service.reorder("owner", "trip", {
        days: [
          { dayId: "day-a", itemIds: ["item"] },
          { dayId: "day-b", itemIds: ["item"] },
        ],
      }),
    ).rejects.toMatchObject({ response: { code: "INVALID_ITINERARY_ORDER" } });
    expect(repository.reorder).not.toHaveBeenCalled();
  });
});
