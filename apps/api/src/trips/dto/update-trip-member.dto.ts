import { IsIn } from "class-validator";
import type {
  TripMemberRole,
  UpdateTripMemberRequest,
} from "@tripforge/contracts";

export class UpdateTripMemberDto implements UpdateTripMemberRequest {
  @IsIn(["editor", "viewer"] satisfies TripMemberRole[])
  role!: TripMemberRole;
}
