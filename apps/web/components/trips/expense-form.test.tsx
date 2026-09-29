import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ExpenseParticipant, TripExpense } from "@tripforge/contracts";
import { describe, expect, it, vi } from "vitest";

import {
  emptyExpenseForm,
  expenseToFormValues,
  toCreateExpenseRequest,
} from "@/lib/trips/expense-form-values";
import { expenseFormSchema } from "@/lib/trips/expense-schema";
import { renderWithQueryClient } from "@/test-utils";
import { expectNoAxeViolations } from "@/test/accessibility";

import { ExpenseForm } from "./expense-form";

const owner = participant("11111111-1111-4111-8111-111111111111", "Artur");
const anna = participant("22222222-2222-4222-8222-222222222222", "Anna");
const former = participant("33333333-3333-4333-8333-333333333333", "Bob");

describe("ExpenseForm", () => {
  it("shows deterministic equal preview and submits string-preserved money", async () => {
    const user = userEvent.setup();
    const submit = vi.fn().mockResolvedValue(undefined);
    renderWithQueryClient(
      <ExpenseForm
        cancelHref="/expenses"
        currentParticipantIds={[owner.userId, anna.userId]}
        defaultValues={emptyExpenseForm([owner, anna], "2027-04-14")}
        isPending={false}
        onSubmit={submit}
        participants={[owner, anna]}
        reservations={[]}
        submitLabel="Create expense"
      />,
    );
    await user.type(screen.getByRole("textbox", { name: "Title" }), "Dinner");
    await user.type(screen.getByRole("textbox", { name: "Amount" }), "100.00");
    expect(screen.getAllByText(/€50\.00/)).toHaveLength(2);
    await user.click(screen.getByRole("button", { name: "Create expense" }));
    expect(submit).toHaveBeenCalledWith(
      expect.objectContaining({ amount: "100.00", title: "Dinner" }),
      expect.anything(),
    );
  });

  it("disables submit while custom allocation mismatches", async () => {
    const user = userEvent.setup();
    const values = emptyExpenseForm([owner, anna], "2027-04-14");
    values.amount = "100.00";
    values.title = "Dinner";
    const { container } = renderWithQueryClient(
      <ExpenseForm
        cancelHref="/expenses"
        currentParticipantIds={[owner.userId, anna.userId]}
        defaultValues={values}
        isPending={false}
        onSubmit={vi.fn()}
        participants={[owner, anna]}
        reservations={[]}
        submitLabel="Create expense"
      />,
    );
    await user.click(screen.getByRole("radio", { name: "Custom" }));
    expect(screen.getByRole("button", { name: "Create expense" })).toBeDisabled();
    const shares = screen.getAllByRole("textbox", { name: "Share in EUR" });
    await user.type(shares[0]!, "40.00");
    await user.type(shares[1]!, "60.00");
    expect(screen.getByText(/Allocated €100\.00 of €100\.00/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Create expense" })).toBeEnabled();
    await expectNoAxeViolations(container);
  });

  it("preserves and labels historical payer and share", () => {
    const expense = fixtureExpense();
    renderWithQueryClient(
      <ExpenseForm
        cancelHref="/expenses"
        currentParticipantIds={[owner.userId]}
        defaultValues={expenseToFormValues(expense)}
        isPending={false}
        onSubmit={vi.fn()}
        participants={[owner, former]}
        reservations={[]}
        submitLabel="Save expense"
      />,
    );
    expect(screen.getByRole("option", { name: "Bob · Former participant" })).toBeVisible();
    expect(screen.getByRole("checkbox", { name: /Bob/ })).toBeChecked();
    expect(screen.getByText("Former")).toBeVisible();
  });

  it("validates JPY and KWD exponents without floating point", () => {
    const values = emptyExpenseForm([owner], "2027-04-14");
    values.title = "Tickets";
    values.currency = "JPY";
    values.amount = "1200.5";
    expect(expenseFormSchema.safeParse(values).success).toBe(false);
    values.currency = "KWD";
    values.amount = "1.234";
    expect(expenseFormSchema.safeParse(values).success).toBe(true);
    expect(toCreateExpenseRequest(values).amountMinor).toBe(1234);
  });
});

function participant(userId: string, displayName: string): ExpenseParticipant {
  return { displayName, email: `${displayName.toLowerCase()}@example.com`, userId };
}

function fixtureExpense(): TripExpense {
  return {
    amountMinor: 1000,
    category: "food",
    createdAt: "2027-01-01T00:00:00.000Z",
    currency: "EUR",
    id: "44444444-4444-4444-8444-444444444444",
    notes: null,
    paidBy: former,
    reservationId: null,
    shares: [{ amountMinor: 1000, participant: former }],
    spentOn: "2027-04-14",
    splitMethod: "custom",
    title: "Dinner",
    updatedAt: "2027-01-01T00:00:00.000Z",
  };
}
