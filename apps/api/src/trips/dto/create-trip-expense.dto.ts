import { Transform, Type } from "class-transformer";
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from "class-validator";
import type {
  CreateTripExpenseRequest,
  TripExpenseCategory,
  TripExpenseSplitRequest,
} from "@tripforge/contracts";
import { normalizeCurrencyCode } from "@tripforge/contracts";

import { IsCalendarDate } from "./calendar-date.validator";
import { TripExpenseSplitDto } from "./trip-expense-split.dto";

export const EXPENSE_CATEGORIES = [
  "accommodation",
  "transport",
  "food",
  "activity",
  "shopping",
  "other",
] satisfies TripExpenseCategory[];

const trim = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim() : value;
const nullable = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim() || null : value;
const currency = ({ value }: { value: unknown }) =>
  typeof value === "string" ? normalizeCurrencyCode(value) : value;

export class CreateTripExpenseDto implements CreateTripExpenseRequest {
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsIn(EXPENSE_CATEGORIES)
  category!: TripExpenseCategory;

  @IsCalendarDate()
  spentOn!: string;

  @Transform(currency)
  @IsString()
  @MaxLength(3)
  @MinLength(3)
  currency!: string;

  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  amountMinor!: number;

  @IsUUID("4")
  paidByUserId!: string;

  @ValidateIf((_object, value: unknown) => value !== null && value !== undefined)
  @IsUUID("4")
  reservationId?: string | null;

  @Transform(nullable)
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string | null;

  @ValidateNested()
  @Type(() => TripExpenseSplitDto)
  split!: TripExpenseSplitRequest;
}
