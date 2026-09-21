import { Transform, Type } from "class-transformer";
import {
  IsIn,
  IsInt,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from "class-validator";
import type {
  CreateDocumentUploadRequest,
  TripDocumentContentType,
  TripDocumentKind,
  TripDocumentLink,
} from "@tripforge/contracts";
import {
  MAX_TRIP_DOCUMENT_SIZE_BYTES,
  TRIP_DOCUMENT_CONTENT_TYPES,
} from "@tripforge/contracts";

import { TripDocumentLinkDto } from "./trip-document-link.dto";

export const TRIP_DOCUMENT_KINDS = [
  "ticket",
  "booking",
  "receipt",
  "image",
  "other",
] satisfies TripDocumentKind[];

const trim = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim() : value;

export function normalizeDocumentFileName(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const leaf = value.split(/[\\/]/).at(-1) ?? "";
  return [...leaf]
    .filter((character) => {
      const code = character.codePointAt(0) ?? 0;
      return code >= 32 && code !== 127;
    })
    .join("")
    .trim()
    .slice(0, 255);
}

export class CreateDocumentUploadDto implements CreateDocumentUploadRequest {
  @IsIn(TRIP_DOCUMENT_KINDS)
  kind!: TripDocumentKind;

  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @Transform(({ value }) => normalizeDocumentFileName(value))
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  fileName!: string;

  @IsIn(TRIP_DOCUMENT_CONTENT_TYPES)
  contentType!: TripDocumentContentType;

  @IsInt()
  @Min(1)
  @Max(MAX_TRIP_DOCUMENT_SIZE_BYTES)
  sizeBytes!: number;

  @ValidateIf((_object, value: unknown) => value !== undefined && value !== null)
  @ValidateNested()
  @Type(() => TripDocumentLinkDto)
  link?: TripDocumentLink;
}
