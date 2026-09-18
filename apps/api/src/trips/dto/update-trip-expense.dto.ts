import { Transform, Type } from "class-transformer";
import {
  IsIn,
  IsInt,
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
  TripExpenseCategory,
  TripExpenseSplitRequest,
  UpdateTripExpenseRequest,
} from "@tripforge/contracts";
import { normalizeCurrencyCode } from "@tripforge/contracts";

import { IsCalendarDate } from "./calendar-date.validator";
import { EXPENSE_CATEGORIES } from "./create-trip-expense.dto";
import { TripExpenseSplitDto } from "./trip-expense-split.dto";

const trim = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim() : value;
const nullable = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim() || null : value;
const currency = ({ value }: { value: unknown }) =>
  typeof value === "string" ? normalizeCurrencyCode(value) : value;

export class UpdateTripExpenseDto implements UpdateTripExpenseRequest {
  @Transform(trim)
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsIn(EXPENSE_CATEGORIES)
  category?: TripExpenseCategory;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsCalendarDate()
  spentOn?: string;

  @Transform(currency)
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @MaxLength(3)
  @MinLength(3)
  currency?: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  amountMinor?: number;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsUUID("4")
  paidByUserId?: string;

  @ValidateIf((_object, value: unknown) => value !== undefined && value !== null)
  @IsUUID("4")
  reservationId?: string | null;

  @Transform(nullable)
  @ValidateIf((_object, value: unknown) => value !== undefined && value !== null)
  @IsString()
  @MaxLength(5000)
  notes?: string | null;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @ValidateNested()
  @Type(() => TripExpenseSplitDto)
  split?: TripExpenseSplitRequest;
}
