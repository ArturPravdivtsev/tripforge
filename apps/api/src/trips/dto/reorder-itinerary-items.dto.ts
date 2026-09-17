import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsUUID,
  ValidateNested,
} from "class-validator";
import type { ReorderItineraryItemsRequest } from "@tripforge/contracts";

class ItineraryDayOrderDto {
  @IsUUID("4")
  dayId!: string;

  @IsArray()
  @IsUUID("4", { each: true })
  itemIds!: string[];
}

export class ReorderItineraryItemsDto
  implements ReorderItineraryItemsRequest
{
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ItineraryDayOrderDto)
  days!: ItineraryDayOrderDto[];
}
