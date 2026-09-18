import "reflect-metadata";

import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { describe, expect, it } from "vitest";

import { CreateTripReservationDto } from "./create-trip-reservation.dto";
import { UpdateTripReservationDto } from "./update-trip-reservation.dto";

const validTransport = {
  destinationName: "Kyoto Station",
  mode: "train",
  operatorName: " JR Central ",
  originName: "Tokyo Station",
  serviceNumber: " Nozomi 215 ",
};

async function errors(value: object) {
  return validate(value, { forbidNonWhitelisted: true, whitelist: true });
}

describe("Trip reservation DTOs", () => {
  it("accepts local schedule values and normalizes nullable text", async () => {
    const dto = plainToInstance(CreateTripReservationDto, {
      confirmationCode: "   ",
      endDate: "2027-04-16",
      endTime: "11:00",
      kind: "accommodation",
      providerName: " Booking.com ",
      startDate: "2027-04-12",
      startTime: "15:00",
      status: "confirmed",
      title: " Hotel Gracery Shinjuku ",
    });
    await expect(errors(dto)).resolves.toEqual([]);
    expect(dto).toMatchObject({
      confirmationCode: null,
      providerName: "Booking.com",
      title: "Hotel Gracery Shinjuku",
    });
  });

  it("rejects invalid enum, date, time, UUID, and forged fields", async () => {
    const dto = plainToInstance(CreateTripReservationDto, {
      createdAt: "forged",
      itineraryItemId: "not-a-uuid",
      kind: "hotel",
      startDate: "2027-02-30",
      startTime: "8:03",
      status: "booked",
      title: "Hotel",
    });
    expect(await errors(dto)).not.toEqual([]);
  });

  it("validates nested transport DTOs and trims their text", async () => {
    const dto = plainToInstance(CreateTripReservationDto, {
      kind: "transport",
      startDate: "2027-04-14",
      status: "confirmed",
      title: "Train",
      transport: validTransport,
    });
    await expect(errors(dto)).resolves.toEqual([]);
    expect(dto.transport).toMatchObject({
      operatorName: "JR Central",
      serviceNumber: "Nozomi 215",
    });
  });

  it("allows partial update fields while rejecting null required values", async () => {
    const valid = plainToInstance(UpdateTripReservationDto, {
      status: "cancelled",
    });
    const invalid = plainToInstance(UpdateTripReservationDto, {
      kind: null,
      startDate: null,
      title: null,
    });
    await expect(errors(valid)).resolves.toEqual([]);
    expect(await errors(invalid)).not.toEqual([]);
  });
});
