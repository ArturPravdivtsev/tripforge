import { Transform, Type } from "class-transformer";
import {
  IsIn,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
  ValidateNested,
} from "class-validator";
import type {
  TransportReservationDetails,
  TripReservationKind,
  TripReservationStatus,
  UpdateTripReservationRequest,
} from "@tripforge/contracts";

import {
  RESERVATION_KINDS,
  RESERVATION_STATUSES,
} from "./create-trip-reservation.dto";
import { IsCalendarDate } from "./calendar-date.validator";
import { TransportReservationDetailsDto } from "./transport-reservation-details.dto";
import { IsWallClockTime } from "./wall-clock-time.validator";

function trim(value: unknown) {
  return typeof value === "string" ? value.trim() : value;
}

function trimNullable(value: unknown) {
  if (typeof value !== "string") return value;
  return value.trim() || null;
}

export class UpdateTripReservationDto
  implements UpdateTripReservationRequest
{
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsIn(RESERVATION_KINDS)
  kind?: TripReservationKind;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsIn(RESERVATION_STATUSES)
  status?: TripReservationStatus;

  @Transform(({ value }: { value: unknown }) => trim(value))
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @Transform(({ value }: { value: unknown }) => trimNullable(value))
  @ValidateIf((_object, value: unknown) => value !== undefined && value !== null)
  @IsString()
  @MaxLength(160)
  providerName?: string | null;

  @Transform(({ value }: { value: unknown }) => trimNullable(value))
  @ValidateIf((_object, value: unknown) => value !== undefined && value !== null)
  @IsString()
  @MaxLength(120)
  confirmationCode?: string | null;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsCalendarDate()
  startDate?: string;

  @ValidateIf((_object, value: unknown) => value !== undefined && value !== null)
  @IsWallClockTime()
  startTime?: string | null;

  @ValidateIf((_object, value: unknown) => value !== undefined && value !== null)
  @IsCalendarDate()
  endDate?: string | null;

  @ValidateIf((_object, value: unknown) => value !== undefined && value !== null)
  @IsWallClockTime()
  endTime?: string | null;

  @Transform(({ value }: { value: unknown }) => trimNullable(value))
  @ValidateIf((_object, value: unknown) => value !== undefined && value !== null)
  @IsString()
  @MaxLength(200)
  locationName?: string | null;

  @Transform(({ value }: { value: unknown }) => trimNullable(value))
  @ValidateIf((_object, value: unknown) => value !== undefined && value !== null)
  @IsString()
  @MaxLength(5000)
  notes?: string | null;

  @ValidateIf((_object, value: unknown) => value !== undefined && value !== null)
  @IsUUID("4")
  itineraryItemId?: string | null;

  @ValidateIf((_object, value: unknown) => value !== undefined && value !== null)
  @ValidateNested()
  @Type(() => TransportReservationDetailsDto)
  transport?: TransportReservationDetails | null;
}
