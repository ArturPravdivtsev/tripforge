import { Allow } from "class-validator";

export class SearchTripQueryDto {
  @Allow()
  q?: unknown;

  @Allow()
  types?: unknown;

  @Allow()
  limit?: unknown;
}
