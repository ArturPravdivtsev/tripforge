import { Transform } from "class-transformer";
import { IsEmail, IsIn, IsString, MaxLength } from "class-validator";
import type {
  AddTripMemberRequest,
  TripMemberRole,
} from "@tripforge/contracts";

export class AddTripMemberDto implements AddTripMemberRequest {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim().toLowerCase() : value,
  )
  @IsString()
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @IsIn(["editor", "viewer"] satisfies TripMemberRole[])
  role!: TripMemberRole;
}
