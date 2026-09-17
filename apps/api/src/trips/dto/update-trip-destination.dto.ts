import { Transform } from "class-transformer";
import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import type { UpdateTripDestinationRequest } from "@tripforge/contracts";

export class UpdateTripDestinationDto
  implements UpdateTripDestinationRequest
{
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value,
  )
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name?: string;

  @IsOptional()
  latitude?: number | null;

  @IsOptional()
  longitude?: number | null;
}
