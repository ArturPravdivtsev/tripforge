import { Transform } from "class-transformer";
import {
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";
import type { CreateTripRequest } from "@tripforge/contracts";

import { IsCalendarDate } from "./calendar-date.validator";

export class CreateTripDto implements CreateTripRequest {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsCalendarDate()
  startsOn?: string | null;

  @IsOptional()
  @IsCalendarDate()
  endsOn?: string | null;
}
