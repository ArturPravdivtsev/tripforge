import { Transform } from "class-transformer";
import { IsEmail, IsString, MaxLength } from "class-validator";
import type { LoginRequest } from "@tripforge/contracts";

import { normalizeEmail } from "../email-normalizer";
import { PASSWORD_MAX_LENGTH } from "./register.dto";

export class LoginDto implements LoginRequest {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? normalizeEmail(value) : value,
  )
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @IsString()
  @MaxLength(PASSWORD_MAX_LENGTH)
  password!: string;
}
