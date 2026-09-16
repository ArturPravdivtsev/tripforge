import { IsArray, IsUUID } from "class-validator";
import type { ReorderTripDestinationsRequest } from "@tripforge/contracts";

export class ReorderTripDestinationsDto
  implements ReorderTripDestinationsRequest
{
  @IsArray()
  @IsUUID("4", { each: true })
  destinationIds!: string[];
}
