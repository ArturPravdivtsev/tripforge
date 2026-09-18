import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import type { TripExpense, TripExpenseBalances } from "@tripforge/contracts";

import type { AuthenticatedUser } from "../auth/auth.types";
import { BrowserMutationGuard } from "../auth/browser/browser-mutation.guard";
import { RequireJsonBody } from "../auth/browser/require-json-body.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { SessionAuthGuard } from "../auth/guards/session-auth.guard";
import { CreateTripExpenseDto } from "./dto/create-trip-expense.dto";
import { UpdateTripExpenseDto } from "./dto/update-trip-expense.dto";
import { TripExpensesService } from "./trip-expenses.service";

@Controller("trips/:tripId/expenses")
@UseGuards(SessionAuthGuard, BrowserMutationGuard)
export class TripExpensesController {
  constructor(private readonly expenses: TripExpensesService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param("tripId", ParseUUIDPipe) tripId: string,
  ): Promise<TripExpense[]> {
    return this.expenses.list(user.id, tripId);
  }

  @Post()
  @RequireJsonBody()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param("tripId", ParseUUIDPipe) tripId: string,
    @Body() input: CreateTripExpenseDto,
  ): Promise<TripExpense> {
    return this.expenses.create(user.id, tripId, input);
  }

  @Get("balances")
  balances(
    @CurrentUser() user: AuthenticatedUser,
    @Param("tripId", ParseUUIDPipe) tripId: string,
  ): Promise<TripExpenseBalances> {
    return this.expenses.balances(user.id, tripId);
  }

  @Get(":expenseId")
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param("tripId", ParseUUIDPipe) tripId: string,
    @Param("expenseId", ParseUUIDPipe) expenseId: string,
  ): Promise<TripExpense> {
    return this.expenses.get(user.id, tripId, expenseId);
  }

  @Patch(":expenseId")
  @RequireJsonBody()
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("tripId", ParseUUIDPipe) tripId: string,
    @Param("expenseId", ParseUUIDPipe) expenseId: string,
    @Body() input: UpdateTripExpenseDto,
  ): Promise<TripExpense> {
    return this.expenses.update(user.id, tripId, expenseId, input);
  }

  @Delete(":expenseId")
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(
    @CurrentUser() user: AuthenticatedUser,
    @Param("tripId", ParseUUIDPipe) tripId: string,
    @Param("expenseId", ParseUUIDPipe) expenseId: string,
  ): Promise<void> {
    return this.expenses.delete(user.id, tripId, expenseId);
  }
}
