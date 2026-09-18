import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { describe, expect, it } from "vitest";

import { CreateTripDestinationDto } from "./create-trip-destination.dto";
import { CreateTripRouteDto } from "./create-trip-route.dto";
import { ReorderTripDestinationsDto } from "./reorder-trip-destinations.dto";
import { UpdateTripDayDto } from "./update-trip-day.dto";
import { UpdateTripDestinationDto } from "./update-trip-destination.dto";
import { UpdateTripRouteDto } from "./update-trip-route.dto";

async function validateDto<T extends object>(dto: T) {
  return validate(dto, { forbidNonWhitelisted: true, whitelist: true });
}

describe("Trip structure DTOs", () => {
  it("trims and validates destination names on create", async () => {
      const Dto = CreateTripDestinationDto;
      const valid = plainToInstance(Dto, { name: "  Tokyo  " });
      const blank = plainToInstance(Dto, { name: "   " });
      const tooLong = plainToInstance(Dto, { name: "x".repeat(161) });

      await expect(validateDto(valid)).resolves.toEqual([]);
      expect(valid.name).toBe("Tokyo");
      await expect(validateDto(blank)).resolves.not.toEqual([]);
      await expect(validateDto(tooLong)).resolves.not.toEqual([]);
  });

  it("allows partial destination updates while validating a supplied name", async () => {
    const coordinates = plainToInstance(UpdateTripDestinationDto, {
      latitude: 35.6762,
      longitude: 139.6503,
    });
    const validName = plainToInstance(UpdateTripDestinationDto, {
      name: "  Tokyo  ",
    });
    const blankName = plainToInstance(UpdateTripDestinationDto, { name: "   " });

    await expect(validateDto(coordinates)).resolves.toEqual([]);
    await expect(validateDto(validName)).resolves.toEqual([]);
    expect(validName.name).toBe("Tokyo");
    await expect(validateDto(blankName)).resolves.not.toEqual([]);
  });

  it("requires an array of v4 destination IDs for reorder", async () => {
    const valid = plainToInstance(ReorderTripDestinationsDto, {
      destinationIds: ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"],
    });
    const invalid = plainToInstance(ReorderTripDestinationsDto, {
      destinationIds: ["not-a-uuid"],
    });

    await expect(validateDto(valid)).resolves.toEqual([]);
    await expect(validateDto(invalid)).resolves.not.toEqual([]);
  });

  it("accepts a nullable Day destination but rejects missing or malformed IDs", async () => {
    const assigned = plainToInstance(UpdateTripDayDto, {
      destinationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    });
    const cleared = plainToInstance(UpdateTripDayDto, { destinationId: null });
    const missing = plainToInstance(UpdateTripDayDto, {});
    const malformed = plainToInstance(UpdateTripDayDto, {
      destinationId: "not-a-uuid",
    });

    await expect(validateDto(assigned)).resolves.toEqual([]);
    await expect(validateDto(cleared)).resolves.toEqual([]);
    await expect(validateDto(missing)).resolves.not.toEqual([]);
    await expect(validateDto(malformed)).resolves.not.toEqual([]);
  });

  it("accepts only TripForge route modes and UUID endpoints", async () => {
    const valid = plainToInstance(CreateTripRouteDto, {
      fromItemId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      mode: "walking",
      toItemId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    });
    const providerProfile = plainToInstance(CreateTripRouteDto, {
      fromItemId: valid.fromItemId,
      mode: "foot-walking",
      toItemId: valid.toItemId,
    });
    const forged = plainToInstance(CreateTripRouteDto, {
      distanceMeters: 10,
      fromItemId: valid.fromItemId,
      geometry: { type: "LineString", coordinates: [] },
      mode: "walking",
      toItemId: valid.toItemId,
    });
    const recalculate = plainToInstance(UpdateTripRouteDto, { mode: "driving" });

    await expect(validateDto(valid)).resolves.toEqual([]);
    await expect(validateDto(providerProfile)).resolves.not.toEqual([]);
    await expect(validateDto(forged)).resolves.not.toEqual([]);
    await expect(validateDto(recalculate)).resolves.toEqual([]);
  });
});
