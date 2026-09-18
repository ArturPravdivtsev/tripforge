import type { ExpenseParticipant, TripExpense } from "@tripforge/contracts";
import { describe, expect, it } from "vitest";

import { deriveTripExpenseBalances } from "./trip-expenses.service";

const artur = participant("a", "Artur");
const anna = participant("b", "Anna");
const bob = participant("c", "Bob");

describe("expense balances and settlements", () => {
  it("distinguishes payer credit from payer debt", () => {
    const result = deriveTripExpenseBalances([
      expense("EUR", 9000, artur, [share(artur, 4500), share(anna, 4500)]),
    ]);
    expect(result.currencies[0]).toMatchObject({
      balances: [
        { netMinor: 4500, participant: artur },
        { netMinor: -4500, participant: anna },
      ],
      currency: "EUR",
      settlements: [{ amountMinor: 4500, from: anna, to: artur }],
      totalExpensesMinor: 9000,
    });
  });

  it("supports a payer who is not a debtor", () => {
    const result = deriveTripExpenseBalances([
      expense("EUR", 100, artur, [share(anna, 50), share(bob, 50)]),
    ]);
    expect(result.currencies[0]?.balances.map(({ netMinor }) => netMinor)).toEqual([
      100,
      -50,
      -50,
    ]);
  });

  it("derives deterministic many-to-many settlements", () => {
    const result = deriveTripExpenseBalances([
      expense("EUR", 7000, artur, [share(anna, 3000), share(bob, 4000)]),
      expense("EUR", 2000, anna, [share(bob, 2000)]),
    ]);
    expect(result.currencies[0]?.settlements).toEqual([
      { amountMinor: 6000, from: bob, to: artur },
      { amountMinor: 1000, from: anna, to: artur },
    ]);
  });

  it("keeps currencies independent and includes zero-net participants", () => {
    const result = deriveTripExpenseBalances([
      expense("JPY", 1000, artur, [share(anna, 1000)]),
      expense("EUR", 500, anna, [share(artur, 500)]),
      expense("EUR", 200, bob, [share(bob, 200)]),
    ]);
    expect(result.currencies.map(({ currency }) => currency)).toEqual(["EUR", "JPY"]);
    expect(result.currencies[0]?.balances).toContainEqual({
      netMinor: 0,
      participant: bob,
    });
    for (const group of result.currencies) {
      expect(group.balances.reduce((sum, balance) => sum + balance.netMinor, 0)).toBe(0);
      expect(group.settlements.every(({ amountMinor }) => amountMinor > 0)).toBe(true);
    }
  });
});

function participant(userId: string, displayName: string): ExpenseParticipant {
  return { displayName, email: `${userId}@example.com`, userId };
}

function share(participantValue: ExpenseParticipant, amountMinor: number) {
  return { amountMinor, participant: participantValue };
}

function expense(
  currency: string,
  amountMinor: number,
  paidBy: ExpenseParticipant,
  shares: TripExpense["shares"],
): TripExpense {
  return {
    amountMinor,
    category: "food",
    createdAt: "2026-01-01T00:00:00.000Z",
    currency,
    id: `${currency}-${amountMinor}-${paidBy.userId}`,
    notes: null,
    paidBy,
    reservationId: null,
    shares,
    spentOn: "2026-01-01",
    splitMethod: "custom",
    title: "Expense",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}
