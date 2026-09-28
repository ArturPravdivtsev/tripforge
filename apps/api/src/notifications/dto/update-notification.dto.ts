import type { UpdateNotificationRequest } from "@tripforge/contracts";
import { IsBoolean } from "class-validator";

export class UpdateNotificationDto implements UpdateNotificationRequest {
  @IsBoolean()
  read!: boolean;
}
