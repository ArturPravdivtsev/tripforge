import "reflect-metadata";

import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { describe, expect, it } from "vitest";

import { CreateItineraryItemDto } from "./create-itinerary-item.dto";
import { ReorderItineraryItemsDto } from "./reorder-itinerary-items.dto";
import { UpdateItineraryItemDto } from "./update-itinerary-item.dto";

async function validateDto<T extends object>(dto: T) {
  return validate(dto, { forbidNonWhitelisted: true, whitelist: true });
}

describe("Itinerary item DTOs", () => {
  const valid = {
    dayId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    kind: "activity",
    title: "Senso-ji",
  };

  it("trims title and normalizes blank notes", async () => {
    const dto = plainToInstance(CreateItineraryItemDto, {
      ...valid,
      notes: "   ",
      startTime: "09:05",
      title: "  Senso-ji  ",
    });

    await expect(validateDto(dto)).resolves.toEqual([]);
    expect(dto.title).toBe("Senso-ji");
    expect(dto.notes).toBeNull();
  });

  it.each(["24:00", "9:30", "09:60", "09:30:00", "9pm"])(
    "rejects malformed wall-clock time: %s",
    async (startTime) => {
      const dto = plainToInstance(CreateItineraryItemDto, {
        ...valid,
        startTime,
      });
      await expect(validateDto(dto)).resolves.not.toEqual([]);
    },
  );

  it("allows nullable time and partial update fields", async () => {
    const dto = plainToInstance(UpdateItineraryItemDto, {
      notes: "  Updated  ",
      startTime: null,
    });
    await expect(validateDto(dto)).resolves.toEqual([]);
    expect(dto.notes).toBe("Updated");
  });

  it("validates nested reorder UUIDs", async () => {
    const validOrder = plainToInstance(ReorderItineraryItemsDto, {
      days: [{ dayId: valid.dayId, itemIds: [valid.dayId] }],
    });
    const invalidOrder = plainToInstance(ReorderItineraryItemsDto, {
      days: [{ dayId: "bad", itemIds: ["also-bad"] }],
    });

    await expect(validateDto(validOrder)).resolves.toEqual([]);
    await expect(validateDto(invalidOrder)).resolves.not.toEqual([]);
  });
});
