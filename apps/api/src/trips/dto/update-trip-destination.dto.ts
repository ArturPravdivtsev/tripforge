import { Transform } from "class-transformer";
import { IsString, MaxLength, MinLength } from "class-validator";
import type { UpdateTripDestinationRequest } from "@tripforge/contracts";

export class UpdateTripDestinationDto
  implements UpdateTripDestinationRequest
{
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name!: string;
}
