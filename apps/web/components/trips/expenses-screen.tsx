"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CurrencyBalance,
  ExpenseParticipant,
  TripExpense,
  TripReservation,
} from "@tripforge/contracts";
import { formatMinorAmount } from "@tripforge/contracts";
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@tripforge/ui";

import { ApiClientError } from "@/lib/api/errors";
import { tripsApi } from "@/lib/api/trips";
import { tripKeys } from "@/lib/trips/query-keys";

import { ExpenseScreenState } from "./expense-screen-state";

export function ExpensesScreen({ tripId }: Readonly<{ tripId: string }>) {
  const queryClient = useQueryClient();
  const [mutationError, setMutationError] = useState<string>();
  const tripQuery = useQuery({
    queryFn: ({ signal }) => tripsApi.get(tripId, { signal }),
    queryKey: tripKeys.detail(tripId),
  });
  const expensesQuery = useQuery({
    queryFn: ({ signal }) => tripsApi.listExpenses(tripId, { signal }),
    queryKey: tripKeys.expenses(tripId),
  });
  const balancesQuery = useQuery({
    queryFn: ({ signal }) => tripsApi.getExpenseBalances(tripId, { signal }),
    queryKey: tripKeys.expenseBalances(tripId),
  });
  const reservationsQuery = useQuery({
    queryFn: ({ signal }) => tripsApi.listReservations(tripId, { signal }),
    queryKey: tripKeys.reservations(tripId),
  });
  const deleteExpense = useMutation({
    mutationFn: (expenseId: string) => tripsApi.removeExpense(tripId, expenseId),
    onSuccess: async (_data, expenseId) => {
      queryClient.removeQueries({ queryKey: tripKeys.expense(tripId, expenseId) });
      await Promise.all([
        queryClient.invalidateQueries({
          exact: true,
          queryKey: tripKeys.expenses(tripId),
        }),
        queryClient.invalidateQueries({
          exact: true,
          queryKey: tripKeys.expenseBalances(tripId),
        }),
      ]);
    },
  });

  if (
    tripQuery.isPending ||
    expensesQuery.isPending ||
    balancesQuery.isPending ||
    reservationsQuery.isPending
  ) {
    return <ExpenseScreenState loading title="Loading expenses…" />;
  }
  const queryError =
    tripQuery.error ?? expensesQuery.error ?? balancesQuery.error ?? reservationsQuery.error;
  if (queryError instanceof ApiClientError && queryError.status === 401) {
    return (
      <ExpenseScreenState title="Sign in to view expenses.">
        <Link className={linkClasses} href="/login">Sign in</Link>
      </ExpenseScreenState>
    );
  }
  if (queryError instanceof ApiClientError && queryError.status === 404) {
    return (
      <ExpenseScreenState title="Trip not found">
        <Link className={linkClasses} href="/trips">Back to trips</Link>
      </ExpenseScreenState>
    );
  }
  if (
    queryError ||
    !tripQuery.data ||
    !expensesQuery.data ||
    !balancesQuery.data ||
    !reservationsQuery.data
  ) {
    return (
      <ExpenseScreenState title="Unable to load expenses.">
        <Button variant="secondary" onClick={() => void expensesQuery.refetch()}>
          Try again
        </Button>
      </ExpenseScreenState>
    );
  }

  const canEdit = tripQuery.data.accessRole !== "viewer";
  const reservations = new Map(
    reservationsQuery.data.map((reservation) => [reservation.id, reservation]),
  );

  async function remove(expense: TripExpense) {
    if (!window.confirm(`Delete expense “${expense.title}”?`)) return;
    setMutationError(undefined);
    try {
      await deleteExpense.mutateAsync(expense.id);
    } catch {
      setMutationError("Unable to delete expense. Please try again.");
    }
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="break-words text-3xl font-bold">Expenses</h1>
          <p className="mt-2 text-[var(--muted-foreground)]">
            Shared costs and exact per-currency balances for {tripQuery.data.name}.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link className={secondaryLinkClasses} href={`/trips/${tripId}`}>
            Trip workspace
          </Link>
          {canEdit ? (
            <Link className={primaryLinkClasses} href={`/trips/${tripId}/expenses/new`}>
              Add expense
            </Link>
          ) : null}
        </div>
      </header>

      {mutationError ? <Alert role="alert">{mutationError}</Alert> : null}

      <section aria-labelledby="balances-heading" className="space-y-4">
        <div>
          <h2 className="text-2xl font-bold" id="balances-heading">Balances</h2>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            Positive means the participant should receive money; negative means they owe.
          </p>
        </div>
        {balancesQuery.data.currencies.length === 0 ? (
          <Card><CardContent className="py-8 text-center text-[var(--muted-foreground)]">No balances yet.</CardContent></Card>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {balancesQuery.data.currencies.map((balance) => (
              <BalanceCard balance={balance} key={balance.currency} />
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="recent-expenses-heading" className="space-y-4">
        <h2 className="text-2xl font-bold" id="recent-expenses-heading">Recent expenses</h2>
        {expensesQuery.data.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-[var(--muted-foreground)]">
              No expenses yet.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {expensesQuery.data.map((expense) => (
              <ExpenseCard
                canEdit={canEdit}
                expense={expense}
                key={expense.id}
                pending={deleteExpense.isPending && deleteExpense.variables === expense.id}
                reservation={
                  expense.reservationId
                    ? reservations.get(expense.reservationId)
                    : undefined
                }
                tripId={tripId}
                onDelete={() => void remove(expense)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function BalanceCard({ balance }: Readonly<{ balance: CurrencyBalance }>) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <CardTitle>{balance.currency}</CardTitle>
          <span className="font-semibold">
            Total {formatMinorAmount(balance.totalExpensesMinor, balance.currency)}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          {balance.balances.map(({ netMinor, participant }) => (
            <div className="flex min-w-0 justify-between gap-4" key={participant.userId}>
              <span className="min-w-0 truncate">{participantLabel(participant)}</span>
              <span className={netMinor < 0 ? "font-semibold text-[var(--danger)]" : "font-semibold text-emerald-700"}>
                {signedAmount(netMinor, balance.currency)}
              </span>
            </div>
          ))}
        </div>
        <div className="border-t border-[var(--border)] pt-4">
          <h3 className="font-semibold">Suggested settlements</h3>
          {balance.settlements.length === 0 ? (
            <p className="mt-2 text-sm text-[var(--muted-foreground)]">Everyone is even.</p>
          ) : (
            <div className="mt-2 space-y-2 text-sm">
              {balance.settlements.map((settlement, index) => (
                <p className="break-words" key={`${settlement.from.userId}-${settlement.to.userId}-${index}`}>
                  {participantLabel(settlement.from)} → {participantLabel(settlement.to)} · {formatMinorAmount(settlement.amountMinor, balance.currency)}
                </p>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ExpenseCard({
  canEdit,
  expense,
  onDelete,
  pending,
  reservation,
  tripId,
}: Readonly<{
  canEdit: boolean;
  expense: TripExpense;
  onDelete: () => void;
  pending: boolean;
  reservation?: TripReservation;
  tripId: string;
}>) {
  return (
    <Card>
      <CardHeader>
        <div className="flex min-w-0 items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
              {CATEGORY_LABELS[expense.category]} · {expense.spentOn}
            </p>
            <CardTitle className="mt-1 break-words">{expense.title}</CardTitle>
          </div>
          <span className="shrink-0 text-lg font-bold">
            {formatMinorAmount(expense.amountMinor, expense.currency)}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1 text-sm">
          <p>Paid by {participantLabel(expense.paidBy)}</p>
          <p>Split between {expense.shares.length} {expense.shares.length === 1 ? "person" : "people"} · {expense.splitMethod}</p>
          {reservation ? (
            <p>
              Reservation: <Link className={linkClasses} href={`/trips/${tripId}/reservations`}>{reservation.title}</Link>
            </p>
          ) : (
            <p className="text-[var(--muted-foreground)]">Not linked to reservation</p>
          )}
          {expense.notes ? <p className="whitespace-pre-wrap break-words pt-2">{expense.notes}</p> : null}
        </div>
        <div className="space-y-2 rounded-[var(--radius-md)] bg-[var(--surface-muted)] p-3 text-sm">
          {expense.shares.map((share) => (
            <div className="flex min-w-0 justify-between gap-4" key={share.participant.userId}>
              <span className="min-w-0 truncate">{participantLabel(share.participant)}</span>
              <span className="shrink-0 font-semibold">{formatMinorAmount(share.amountMinor, expense.currency)}</span>
            </div>
          ))}
        </div>
        {canEdit ? (
          <div className="flex flex-wrap gap-2 border-t border-[var(--border)] pt-4">
            <Link className={secondaryLinkClasses} href={`/trips/${tripId}/expenses/${expense.id}/edit`}>
              Edit
            </Link>
            <Button type="button" className="text-[var(--danger)]" disabled={pending} variant="ghost" onClick={onDelete}>
              Delete expense
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function signedAmount(amountMinor: number, currency: string): string {
  if (amountMinor === 0) return formatMinorAmount(0, currency);
  return `${amountMinor > 0 ? "+" : "−"}${formatMinorAmount(Math.abs(amountMinor), currency)}`;
}

function participantLabel(participant: ExpenseParticipant): string {
  return participant.displayName || participant.email;
}

const CATEGORY_LABELS = {
  accommodation: "Accommodation",
  activity: "Activity",
  food: "Food",
  other: "Other",
  shopping: "Shopping",
  transport: "Transport",
} as const;
const linkClasses = "font-semibold text-[var(--primary)] hover:underline";
const primaryLinkClasses =
  "inline-flex min-h-11 items-center justify-center rounded-[var(--radius-md)] bg-[var(--primary)] px-4 py-2 font-semibold text-[var(--primary-foreground)]";
const secondaryLinkClasses =
  "inline-flex min-h-11 items-center justify-center rounded-[var(--radius-md)] bg-[var(--surface-muted)] px-4 py-2 font-semibold hover:bg-[var(--muted)]";
