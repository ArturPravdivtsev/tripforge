import { Transform, Type } from "class-transformer";
import {
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
  ValidateNested,
} from "class-validator";
import type {
  CreateTripReservationRequest,
  TransportReservationDetails,
  TripReservationKind,
  TripReservationStatus,
} from "@tripforge/contracts";

import { IsCalendarDate } from "./calendar-date.validator";
import { TransportReservationDetailsDto } from "./transport-reservation-details.dto";
import { IsWallClockTime } from "./wall-clock-time.validator";

export const RESERVATION_KINDS = [
  "accommodation",
  "transport",
  "restaurant",
  "activity",
  "other",
] satisfies TripReservationKind[];

export const RESERVATION_STATUSES = [
  "pending",
  "confirmed",
  "cancelled",
] satisfies TripReservationStatus[];

function trim(value: unknown) {
  return typeof value === "string" ? value.trim() : value;
}

function trimNullable(value: unknown) {
  if (typeof value !== "string") return value;
  return value.trim() || null;
}

export class CreateTripReservationDto
  implements CreateTripReservationRequest
{
  @IsIn(RESERVATION_KINDS)
  kind!: TripReservationKind;

  @IsIn(RESERVATION_STATUSES)
  status!: TripReservationStatus;

  @Transform(({ value }: { value: unknown }) => trim(value))
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @Transform(({ value }: { value: unknown }) => trimNullable(value))
  @IsOptional()
  @IsString()
  @MaxLength(160)
  providerName?: string | null;

  @Transform(({ value }: { value: unknown }) => trimNullable(value))
  @IsOptional()
  @IsString()
  @MaxLength(120)
  confirmationCode?: string | null;

  @IsCalendarDate()
  startDate!: string;

  @ValidateIf((_object, value: unknown) => value !== null && value !== undefined)
  @IsWallClockTime()
  startTime?: string | null;

  @ValidateIf((_object, value: unknown) => value !== null && value !== undefined)
  @IsCalendarDate()
  endDate?: string | null;

  @ValidateIf((_object, value: unknown) => value !== null && value !== undefined)
  @IsWallClockTime()
  endTime?: string | null;

  @Transform(({ value }: { value: unknown }) => trimNullable(value))
  @IsOptional()
  @IsString()
  @MaxLength(200)
  locationName?: string | null;

  @Transform(({ value }: { value: unknown }) => trimNullable(value))
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string | null;

  @ValidateIf((_object, value: unknown) => value !== null && value !== undefined)
  @IsUUID("4")
  itineraryItemId?: string | null;

  @ValidateIf((_object, value: unknown) => value !== null && value !== undefined)
  @ValidateNested()
  @Type(() => TransportReservationDetailsDto)
  transport?: TransportReservationDetails | null;
}
