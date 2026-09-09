import { SetMetadata } from "@nestjs/common";

export const REQUIRES_JSON_BODY = "tripforge:requires-json-body";

export const RequireJsonBody = () => SetMetadata(REQUIRES_JSON_BODY, true);
