import { IsIn, IsUUID } from "class-validator";

import type { TripDocumentLink } from "@tripforge/contracts";

type DocumentLinkValue = NonNullable<TripDocumentLink>;

export class TripDocumentLinkDto {
  @IsIn(["itinerary", "reservation", "expense"])
  type!: DocumentLinkValue["type"];

  @IsUUID("4")
  id!: string;
}
