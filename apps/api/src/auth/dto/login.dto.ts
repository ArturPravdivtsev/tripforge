import { Transform } from "class-transformer";
import { IsEmail, IsString, MaxLength } from "class-validator";

import { normalizeEmail } from "../email-normalizer";
import { PASSWORD_MAX_LENGTH } from "./register.dto";

export class LoginDto {
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
