import { IsDefined, IsUUID, ValidateIf } from "class-validator";
import type { UpdateTripDayRequest } from "@tripforge/contracts";

export class UpdateTripDayDto implements UpdateTripDayRequest {
  @IsDefined()
  @ValidateIf((_object, value: unknown) => value !== null)
  @IsUUID("4")
  destinationId!: string | null;
}
