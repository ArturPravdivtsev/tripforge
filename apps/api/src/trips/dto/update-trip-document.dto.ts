import { Transform, Type } from "class-transformer";
import {
  IsIn,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
  ValidateNested,
} from "class-validator";
import type {
  TripDocumentKind,
  TripDocumentLink,
  UpdateTripDocumentRequest,
} from "@tripforge/contracts";

import { TRIP_DOCUMENT_KINDS } from "./create-document-upload.dto";
import { TripDocumentLinkDto } from "./trip-document-link.dto";

const trim = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim() : value;

export class UpdateTripDocumentDto implements UpdateTripDocumentRequest {
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsIn(TRIP_DOCUMENT_KINDS)
  kind?: TripDocumentKind;

  @Transform(trim)
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @ValidateIf((_object, value: unknown) => value !== undefined && value !== null)
  @ValidateNested()
  @Type(() => TripDocumentLinkDto)
  link?: TripDocumentLink;
}
