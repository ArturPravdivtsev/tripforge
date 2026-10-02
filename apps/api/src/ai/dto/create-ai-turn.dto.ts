import { Transform } from "class-transformer";
import { IsString, MaxLength, MinLength } from "class-validator";
import type { CreateAiTurnRequest } from "@tripforge/contracts";

export class CreateAiTurnDto implements CreateAiTurnRequest {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  message!: string;
}
