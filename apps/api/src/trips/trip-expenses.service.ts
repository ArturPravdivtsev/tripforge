import { HttpException, HttpStatus, Injectable } from "@nestjs/common";
import type {
  CreateTripExpenseRequest,
  CurrencyBalance,
  ExpenseParticipant,
  SuggestedSettlement,
  TripExpense,
  TripExpenseBalances,
  TripExpenseSplitRequest,
  UpdateTripExpenseRequest,
} from "@tripforge/contracts";
import {
  allocateEqualSplit,
  isSupportedCurrency,
  normalizeCurrencyCode,
} from "@tripforge/contracts";

import { TripPermissionsService } from "./trip-permissions.service";
import {
  type ExpenseShareState,
  type ExpenseState,
  TripExpensesRepository,
} from "./trip-expenses.repository";
import { TripsRepository } from "./trips.repository";

@Injectable()
export class TripExpensesService {
  constructor(
    private readonly expenses: TripExpensesRepository,
    private readonly permissions: TripPermissionsService,
    private readonly trips: TripsRepository,
  ) {}

  async list(userId: string, tripId: string): Promise<TripExpense[]> {
    await this.permissions.requireReadable(userId, tripId);
    return this.expenses.list(tripId);
  }

  async get(
    userId: string,
    tripId: string,
    expenseId: string,
  ): Promise<TripExpense> {
    await this.permissions.requireReadable(userId, tripId);
    const expense = await this.expenses.find(tripId, expenseId);
    if (!expense) throw expenseNotFound();
    return expense;
  }

  async balances(
    userId: string,
    tripId: string,
  ): Promise<TripExpenseBalances> {
    await this.permissions.requireReadable(userId, tripId);
    return deriveTripExpenseBalances(await this.expenses.list(tripId));
  }

  async create(
    userId: string,
    tripId: string,
    input: CreateTripExpenseRequest,
  ): Promise<TripExpense> {
    await this.permissions.requireEditable(userId, tripId);
    const currentParticipants = await this.currentParticipantIds(tripId);
    this.assertCurrentParticipant(input.paidByUserId, currentParticipants);
    await this.validateReservation(tripId, input.reservationId ?? null);

    const state: ExpenseState = {
      amountMinor: input.amountMinor,
      category: input.category,
      currency: normalizeAndValidateCurrency(input.currency),
      notes: normalizeNullable(input.notes ?? null),
      paidByUserId: input.paidByUserId,
      reservationId: input.reservationId ?? null,
      shares: deriveShares(
        input.amountMinor,
        input.split,
        currentParticipants,
        new Set(),
      ),
      spentOn: input.spentOn,
      splitMethod: input.split.method,
      title: input.title.trim(),
    };
    return this.expenses.create(tripId, state);
  }

  async update(
    userId: string,
    tripId: string,
    expenseId: string,
    input: UpdateTripExpenseRequest,
  ): Promise<TripExpense> {
    await this.permissions.requireEditable(userId, tripId);
    if (!Object.values(input).some((value) => value !== undefined)) {
      throw expenseError(
        "EMPTY_EXPENSE_UPDATE",
        "Provide at least one expense field to update",
        HttpStatus.BAD_REQUEST,
      );
    }

    const existing = await this.expenses.find(tripId, expenseId);
    if (!existing) throw expenseNotFound();
    const currentParticipants = await this.currentParticipantIds(tripId);

    const paidByUserId = input.paidByUserId ?? existing.paidBy.userId;
    if (paidByUserId !== existing.paidBy.userId) {
      this.assertCurrentParticipant(paidByUserId, currentParticipants);
    }
    const reservationId =
      input.reservationId === undefined
        ? existing.reservationId
        : input.reservationId;
    if (input.reservationId !== undefined) {
      await this.validateReservation(tripId, reservationId);
    }

    const amountMinor = input.amountMinor ?? existing.amountMinor;
    const historicalParticipants = new Set(
      existing.shares.map(({ participant }) => participant.userId),
    );
    let shares: readonly ExpenseShareState[] = existing.shares.map((share) => ({
      amountMinor: share.amountMinor,
      userId: share.participant.userId,
    }));
    let splitMethod = existing.splitMethod;
    let replaceShares = false;

    if (input.split) {
      shares = deriveShares(
        amountMinor,
        input.split,
        currentParticipants,
        historicalParticipants,
      );
      splitMethod = input.split.method;
      replaceShares = true;
    } else if (input.amountMinor !== undefined) {
      if (existing.splitMethod === "custom") {
        throw invalidSplit(
          "Changing a custom-split amount requires a new custom split",
        );
      }
      shares = allocateEqualSplit(
        amountMinor,
        existing.shares.map(({ participant }) => participant.userId),
      );
      replaceShares = true;
    }

    const state: ExpenseState = {
      amountMinor,
      category: input.category ?? existing.category,
      currency:
        input.currency === undefined
          ? existing.currency
          : normalizeAndValidateCurrency(input.currency),
      notes:
        input.notes === undefined ? existing.notes : normalizeNullable(input.notes),
      paidByUserId,
      reservationId,
      shares,
      spentOn: input.spentOn ?? existing.spentOn,
      splitMethod,
      title: input.title?.trim() ?? existing.title,
    };

    const updated = await this.expenses.update(
      tripId,
      expenseId,
      state,
      replaceShares,
    );
    if (!updated) throw expenseNotFound();
    return updated;
  }

  async delete(
    userId: string,
    tripId: string,
    expenseId: string,
  ): Promise<void> {
    await this.permissions.requireEditable(userId, tripId);
    if (!(await this.expenses.delete(tripId, expenseId))) {
      throw expenseNotFound();
    }
  }

  private async currentParticipantIds(tripId: string): Promise<Set<string>> {
    const participants = await this.trips.listParticipants(tripId);
    if (!participants) {
      throw expenseError("TRIP_NOT_FOUND", "Trip not found", HttpStatus.NOT_FOUND);
    }
    return new Set(participants.map(({ user }) => user.id));
  }

  private assertCurrentParticipant(
    userId: string,
    currentParticipants: ReadonlySet<string>,
  ): void {
    if (!currentParticipants.has(userId)) {
      throw expenseError(
        "TRIP_PARTICIPANT_NOT_FOUND",
        "Trip participant not found",
        HttpStatus.NOT_FOUND,
      );
    }
  }

  private async validateReservation(
    tripId: string,
    reservationId: string | null,
  ): Promise<void> {
    if (
      reservationId &&
      !(await this.expenses.reservationBelongsToTrip(tripId, reservationId))
    ) {
      throw expenseError(
        "RESERVATION_NOT_FOUND",
        "Reservation not found",
        HttpStatus.NOT_FOUND,
      );
    }
  }
}

function deriveShares(
  amountMinor: number,
  split: TripExpenseSplitRequest,
  currentParticipants: ReadonlySet<string>,
  historicalParticipants: ReadonlySet<string>,
): ExpenseShareState[] {
  const instructions =
    split.method === "equal"
      ? split.participantUserIds.map((userId) => ({ userId }))
      : split.shares;
  const userIds = instructions.map(({ userId }) => userId);
  if (userIds.length === 0 || new Set(userIds).size !== userIds.length) {
    throw invalidSplit("Expense splits require unique participants");
  }
  for (const userId of userIds) {
    if (!currentParticipants.has(userId) && !historicalParticipants.has(userId)) {
      throw expenseError(
        "TRIP_PARTICIPANT_NOT_FOUND",
        "Trip participant not found",
        HttpStatus.NOT_FOUND,
      );
    }
  }

  if (split.method === "equal") {
    return allocateEqualSplit(amountMinor, split.participantUserIds);
  }

  let total = 0;
  for (const share of split.shares) {
    if (!Number.isSafeInteger(share.amountMinor) || share.amountMinor < 0) {
      throw invalidSplit("Expense shares must use non-negative safe integers");
    }
    total = safeAdd(total, share.amountMinor);
  }
  if (total !== amountMinor) {
    throw invalidSplit("Expense shares must exactly equal the expense amount");
  }
  return split.shares.map(({ amountMinor: shareAmount, userId }) => ({
    amountMinor: shareAmount,
    userId,
  }));
}

export function deriveTripExpenseBalances(
  expenses: readonly TripExpense[],
): TripExpenseBalances {
  const groups = new Map<
    string,
    {
      participants: Map<string, { netMinor: number; participant: ExpenseParticipant }>;
      totalExpensesMinor: number;
    }
  >();

  for (const expense of expenses) {
    const group = groups.get(expense.currency) ?? {
      participants: new Map(),
      totalExpensesMinor: 0,
    };
    group.totalExpensesMinor = safeAdd(
      group.totalExpensesMinor,
      expense.amountMinor,
    );
    adjustBalance(group.participants, expense.paidBy, expense.amountMinor);
    for (const share of expense.shares) {
      adjustBalance(group.participants, share.participant, -share.amountMinor);
    }
    groups.set(expense.currency, group);
  }

  const currencies: CurrencyBalance[] = [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right, "en"))
    .map(([currency, group]) => {
      const balances = [...group.participants.values()].sort((left, right) =>
        left.participant.userId.localeCompare(right.participant.userId, "en"),
      );
      const netTotal = balances.reduce(
        (total, balance) => safeAdd(total, balance.netMinor),
        0,
      );
      if (netTotal !== 0) {
        throw new Error(`Expense balances do not net to zero for ${currency}`);
      }
      return {
        balances,
        currency,
        settlements: deriveSettlements(balances),
        totalExpensesMinor: group.totalExpensesMinor,
      };
    });
  return { currencies };
}

function deriveSettlements(
  balances: CurrencyBalance["balances"],
): SuggestedSettlement[] {
  const byMagnitudeThenId = (
    left: CurrencyBalance["balances"][number],
    right: CurrencyBalance["balances"][number],
  ) =>
    Math.abs(right.netMinor) - Math.abs(left.netMinor) ||
    left.participant.userId.localeCompare(right.participant.userId, "en");
  const creditors = balances
    .filter(({ netMinor }) => netMinor > 0)
    .sort(byMagnitudeThenId)
    .map((balance) => ({ ...balance }));
  const debtors = balances
    .filter(({ netMinor }) => netMinor < 0)
    .sort(byMagnitudeThenId)
    .map((balance) => ({ ...balance }));
  const settlements: SuggestedSettlement[] = [];
  let creditorIndex = 0;
  let debtorIndex = 0;

  while (creditorIndex < creditors.length && debtorIndex < debtors.length) {
    const creditor = creditors[creditorIndex];
    const debtor = debtors[debtorIndex];
    if (!creditor || !debtor) break;
    const amountMinor = Math.min(creditor.netMinor, -debtor.netMinor);
    if (amountMinor > 0) {
      settlements.push({
        amountMinor,
        from: debtor.participant,
        to: creditor.participant,
      });
    }
    creditor.netMinor -= amountMinor;
    debtor.netMinor += amountMinor;
    if (creditor.netMinor === 0) creditorIndex += 1;
    if (debtor.netMinor === 0) debtorIndex += 1;
  }
  return settlements;
}

function adjustBalance(
  balances: Map<string, { netMinor: number; participant: ExpenseParticipant }>,
  participant: ExpenseParticipant,
  delta: number,
): void {
  const existing = balances.get(participant.userId);
  balances.set(participant.userId, {
    netMinor: safeAdd(existing?.netMinor ?? 0, delta),
    participant,
  });
}

function normalizeAndValidateCurrency(currency: string): string {
  const normalized = normalizeCurrencyCode(currency);
  if (!isSupportedCurrency(normalized)) {
    throw expenseError(
      "UNSUPPORTED_CURRENCY",
      "Currency is not supported by this runtime",
      HttpStatus.BAD_REQUEST,
    );
  }
  return normalized;
}

function normalizeNullable(value: string | null): string | null {
  return value?.trim() || null;
}

function safeAdd(left: number, right: number): number {
  const result = left + right;
  if (!Number.isSafeInteger(result)) {
    throw invalidSplit("Money aggregate exceeds the safe integer range");
  }
  return result;
}

function expenseNotFound(): HttpException {
  return expenseError("EXPENSE_NOT_FOUND", "Expense not found", HttpStatus.NOT_FOUND);
}

function invalidSplit(message: string): HttpException {
  return expenseError("INVALID_EXPENSE_SPLIT", message, HttpStatus.BAD_REQUEST);
}

function expenseError(
  code: string,
  message: string,
  status: HttpStatus,
): HttpException {
  return new HttpException({ code, message }, status);
}
