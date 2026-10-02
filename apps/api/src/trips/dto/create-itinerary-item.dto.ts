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
  CreateItineraryItemRequest,
  ItineraryItemKind,
  ItineraryPlaceInput,
} from "@tripforge/contracts";

import { IsWallClockTime } from "./wall-clock-time.validator";
import { ItineraryPlaceDto } from "./itinerary-place.dto";

const ITEM_KINDS = [
  "activity",
  "food",
  "transport",
  "accommodation",
  "other",
] satisfies ItineraryItemKind[];

export class CreateItineraryItemDto implements CreateItineraryItemRequest {
  @IsUUID("4")
  dayId!: string;

  @IsIn(ITEM_KINDS)
  kind!: ItineraryItemKind;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @ValidateIf((_object, value: unknown) => value !== null && value !== undefined)
  @IsWallClockTime()
  startTime?: string | null;

  @ValidateIf((_object, value: unknown) => value !== null && value !== undefined)
  @IsWallClockTime()
  endTime?: string | null;

  @Transform(({ value }: { value: unknown }) => {
    if (typeof value !== "string") return value;
    const normalized = value.trim();
    return normalized || null;
  })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string | null;

  @ValidateIf((_object, value: unknown) => value !== null && value !== undefined)
  @ValidateNested()
  @Type(() => ItineraryPlaceDto)
  place?: ItineraryPlaceInput | null;
}

export { ITEM_KINDS };
