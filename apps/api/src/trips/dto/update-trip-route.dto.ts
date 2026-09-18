import type {
  TripRouteMode,
  UpdateTripRouteRequest,
} from "@tripforge/contracts";
import { IsIn } from "class-validator";

const routeModes: TripRouteMode[] = ["walking", "cycling", "driving"];

export class UpdateTripRouteDto implements UpdateTripRouteRequest {
  @IsIn(routeModes)
  mode!: TripRouteMode;
}
