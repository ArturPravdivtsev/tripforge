import type {
  CreateTripRouteRequest,
  TripRouteMode,
} from "@tripforge/contracts";
import { IsIn, IsUUID } from "class-validator";

const routeModes: TripRouteMode[] = ["walking", "cycling", "driving"];

export class CreateTripRouteDto implements CreateTripRouteRequest {
  @IsUUID()
  fromItemId!: string;

  @IsUUID()
  toItemId!: string;

  @IsIn(routeModes)
  mode!: TripRouteMode;
}
