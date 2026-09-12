import { Transform } from "class-transformer";
import {
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from "class-validator";
import type { UpdateTripRequest } from "@tripforge/contracts";

import { IsCalendarDate } from "./calendar-date.validator";

export class UpdateTripDto implements UpdateTripRequest {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value,
  )
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsCalendarDate()
  startsOn?: string | null;

  @IsOptional()
  @IsCalendarDate()
  endsOn?: string | null;
}
