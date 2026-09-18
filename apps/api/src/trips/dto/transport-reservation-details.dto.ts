import { Transform } from "class-transformer";
import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";
import type {
  TransportReservationDetails,
  TransportReservationMode,
} from "@tripforge/contracts";

export const TRANSPORT_RESERVATION_MODES = [
  "flight",
  "train",
  "bus",
  "ferry",
  "other",
] satisfies TransportReservationMode[];

function trim(value: unknown) {
  return typeof value === "string" ? value.trim() : value;
}

function trimNullable(value: unknown) {
  if (typeof value !== "string") return value;
  return value.trim() || null;
}

export class TransportReservationDetailsDto
  implements TransportReservationDetails
{
  @IsIn(TRANSPORT_RESERVATION_MODES)
  mode!: TransportReservationMode;

  @Transform(({ value }: { value: unknown }) => trimNullable(value))
  @IsOptional()
  @IsString()
  @MaxLength(160)
  operatorName!: string | null;

  @Transform(({ value }: { value: unknown }) => trimNullable(value))
  @IsOptional()
  @IsString()
  @MaxLength(120)
  serviceNumber!: string | null;

  @Transform(({ value }: { value: unknown }) => trim(value))
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  originName!: string;

  @Transform(({ value }: { value: unknown }) => trim(value))
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  destinationName!: string;
}
