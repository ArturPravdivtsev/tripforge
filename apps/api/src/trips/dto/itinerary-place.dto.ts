import { Transform } from "class-transformer";
import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";
import type { ItineraryPlaceInput, PlaceProvider } from "@tripforge/contracts";

function normalizeNullableText(value: unknown): unknown {
  if (typeof value !== "string") return value;
  return value.trim() || null;
}

export class ItineraryPlaceDto implements ItineraryPlaceInput {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @Transform(({ value }: { value: unknown }) => normalizeNullableText(value))
  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string | null;

  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(-90)
  @Max(90)
  latitude!: number;

  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(-180)
  @Max(180)
  longitude!: number;

  @IsIn(["maptiler"] satisfies PlaceProvider[])
  provider!: PlaceProvider;

  @Transform(({ value }: { value: unknown }) => normalizeNullableText(value))
  @IsOptional()
  @IsString()
  @MaxLength(300)
  providerReference?: string | null;
}
