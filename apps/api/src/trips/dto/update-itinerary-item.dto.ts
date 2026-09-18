import { Transform, Type } from "class-transformer";
import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
  ValidateNested,
} from "class-validator";
import type {
  ItineraryItemKind,
  ItineraryPlaceInput,
  UpdateItineraryItemRequest,
} from "@tripforge/contracts";

import { ITEM_KINDS } from "./create-itinerary-item.dto";
import { IsWallClockTime } from "./wall-clock-time.validator";
import { ItineraryPlaceDto } from "./itinerary-place.dto";

export class UpdateItineraryItemDto implements UpdateItineraryItemRequest {
  @IsOptional()
  @IsIn(ITEM_KINDS)
  kind?: ItineraryItemKind;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value,
  )
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @ValidateIf((_object, value: unknown) => value !== null && value !== undefined)
  @IsWallClockTime()
  startTime?: string | null;

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
