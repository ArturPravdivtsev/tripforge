import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsUUID,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from "class-validator";
import type {
  CustomTripExpenseSplitRequest,
  EqualTripExpenseSplitRequest,
  TripExpenseSplitMethod,
} from "@tripforge/contracts";

export class TripExpenseCustomShareDto {
  @IsUUID("4")
  userId!: string;

  @IsInt()
  @Min(0)
  @Max(Number.MAX_SAFE_INTEGER)
  amountMinor!: number;
}

export class TripExpenseSplitDto {
  @IsIn(["equal", "custom"] satisfies TripExpenseSplitMethod[])
  method!: TripExpenseSplitMethod;

  @ValidateIf((value: TripExpenseSplitDto) => value.method === "equal")
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID("4", { each: true })
  participantUserIds?: EqualTripExpenseSplitRequest["participantUserIds"];

  @ValidateIf((value: TripExpenseSplitDto) => value.method === "custom")
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => TripExpenseCustomShareDto)
  shares?: CustomTripExpenseSplitRequest["shares"];
}
