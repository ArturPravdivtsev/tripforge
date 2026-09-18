import type {
  CreateTripExpenseRequest,
  ExpenseParticipant,
  TripExpense,
  UpdateTripExpenseRequest,
} from "@tripforge/contracts";
import {
  minorAmountToMajorString,
  parseMajorAmountToMinor,
} from "@tripforge/contracts";

import {
  expenseFormSchema,
  type ExpenseFormValues,
} from "./expense-schema";

export function emptyExpenseForm(
  participants: readonly ExpenseParticipant[],
  spentOn: string,
): ExpenseFormValues {
  return {
    amount: "",
    category: "food",
    currency: "EUR",
    customAmounts: {},
    notes: "",
    paidByUserId: participants[0]?.userId ?? "",
    participantUserIds: participants.map(({ userId }) => userId),
    reservationId: "",
    spentOn,
    splitMethod: "equal",
    title: "",
  };
}

export function expenseToFormValues(expense: TripExpense): ExpenseFormValues {
  return {
    amount: minorAmountToMajorString(expense.amountMinor, expense.currency),
    category: expense.category,
    currency: expense.currency,
    customAmounts: Object.fromEntries(
      expense.shares.map((share) => [
        share.participant.userId,
        minorAmountToMajorString(share.amountMinor, expense.currency),
      ]),
    ),
    notes: expense.notes ?? "",
    paidByUserId: expense.paidBy.userId,
    participantUserIds: expense.shares.map(
      ({ participant }) => participant.userId,
    ),
    reservationId: expense.reservationId ?? "",
    spentOn: expense.spentOn,
    splitMethod: expense.splitMethod,
    title: expense.title,
  };
}

export function toCreateExpenseRequest(
  values: ExpenseFormValues,
): CreateTripExpenseRequest {
  const parsed = expenseFormSchema.parse(values);
  const amountMinor = requiredMinor(parsed.amount, parsed.currency);
  return {
    amountMinor,
    category: parsed.category,
    currency: parsed.currency,
    notes: nullable(parsed.notes),
    paidByUserId: parsed.paidByUserId,
    reservationId: nullable(parsed.reservationId),
    spentOn: parsed.spentOn,
    split:
      parsed.splitMethod === "equal"
        ? {
            method: "equal",
            participantUserIds: parsed.participantUserIds,
          }
        : {
            method: "custom",
            shares: parsed.participantUserIds.map((userId) => ({
              amountMinor: requiredMinor(
                parsed.customAmounts[userId] ?? "",
                parsed.currency,
              ),
              userId,
            })),
          },
    title: parsed.title,
  };
}

export function toUpdateExpenseRequest(
  values: ExpenseFormValues,
): UpdateTripExpenseRequest {
  return toCreateExpenseRequest(values);
}

export function uniqueExpenseParticipants(
  participants: readonly ExpenseParticipant[],
): ExpenseParticipant[] {
  return [
    ...new Map(participants.map((participant) => [participant.userId, participant])).values(),
  ];
}

function requiredMinor(value: string, currency: string): number {
  const amount = parseMajorAmountToMinor(value, currency);
  if (amount === null) throw new Error("Validated money amount could not be parsed");
  return amount;
}

function nullable(value: string): string | null {
  return value.trim() || null;
}
