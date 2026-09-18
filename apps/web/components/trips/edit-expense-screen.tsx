"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@tripforge/ui";

import { ApiClientError } from "@/lib/api/errors";
import { tripsApi } from "@/lib/api/trips";
import {
  expenseToFormValues,
  toUpdateExpenseRequest,
  uniqueExpenseParticipants,
} from "@/lib/trips/expense-form-values";
import type { ExpenseFormValues } from "@/lib/trips/expense-schema";
import { tripKeys } from "@/lib/trips/query-keys";

import { ExpenseForm } from "./expense-form";
import { ExpenseScreenState } from "./expense-screen-state";
import {
  expenseMutationError,
  toExpenseParticipant,
} from "./new-expense-screen";

type EditExpenseScreenProps = Readonly<{
  expenseId: string;
  tripId: string;
}>;

export function EditExpenseScreen({ expenseId, tripId }: EditExpenseScreenProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState<string>();
  const tripQuery = useQuery({
    queryFn: ({ signal }) => tripsApi.get(tripId, { signal }),
    queryKey: tripKeys.detail(tripId),
  });
  const expenseQuery = useQuery({
    queryFn: ({ signal }) => tripsApi.getExpense(tripId, expenseId, { signal }),
    queryKey: tripKeys.expense(tripId, expenseId),
  });
  const membersQuery = useQuery({
    queryFn: ({ signal }) => tripsApi.listMembers(tripId, { signal }),
    queryKey: tripKeys.members(tripId),
  });
  const reservationsQuery = useQuery({
    queryFn: ({ signal }) => tripsApi.listReservations(tripId, { signal }),
    queryKey: tripKeys.reservations(tripId),
  });
  const updateExpense = useMutation({
    mutationFn: (values: ExpenseFormValues) =>
      tripsApi.updateExpense(tripId, expenseId, toUpdateExpenseRequest(values)),
    onSuccess: async (expense) => {
      queryClient.setQueryData(tripKeys.expense(tripId, expenseId), expense);
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
      router.push(`/trips/${tripId}/expenses`);
    },
  });

  if (
    tripQuery.isPending ||
    expenseQuery.isPending ||
    membersQuery.isPending ||
    reservationsQuery.isPending
  ) {
    return <ExpenseScreenState loading title="Loading expense…" />;
  }
  const queryError =
    tripQuery.error ?? expenseQuery.error ?? membersQuery.error ?? reservationsQuery.error;
  if (queryError instanceof ApiClientError && queryError.status === 401) {
    return (
      <ExpenseScreenState title="Sign in to edit this expense.">
        <Link className={linkClasses} href="/login">Sign in</Link>
      </ExpenseScreenState>
    );
  }
  if (queryError instanceof ApiClientError && queryError.status === 404) {
    return (
      <ExpenseScreenState title="Expense not found">
        <Link className={linkClasses} href={`/trips/${tripId}/expenses`}>
          Back to expenses
        </Link>
      </ExpenseScreenState>
    );
  }
  if (
    queryError ||
    !tripQuery.data ||
    !expenseQuery.data ||
    !membersQuery.data ||
    !reservationsQuery.data
  ) {
    return (
      <ExpenseScreenState title="Unable to load expense.">
        <Button variant="secondary" onClick={() => void expenseQuery.refetch()}>
          Try again
        </Button>
      </ExpenseScreenState>
    );
  }
  if (tripQuery.data.accessRole === "viewer") {
    return (
      <ExpenseScreenState title="You have view-only access to this trip.">
        <Link className={linkClasses} href={`/trips/${tripId}/expenses`}>
          Back to expenses
        </Link>
      </ExpenseScreenState>
    );
  }

  const currentParticipants = membersQuery.data.map(toExpenseParticipant);
  const participants = uniqueExpenseParticipants([
    ...currentParticipants,
    expenseQuery.data.paidBy,
    ...expenseQuery.data.shares.map(({ participant }) => participant),
  ]);

  async function submit(values: ExpenseFormValues) {
    setServerError(undefined);
    try {
      await updateExpense.mutateAsync(values);
    } catch (error) {
      setServerError(expenseMutationError(error));
    }
  }

  return (
    <ExpenseForm
      cancelHref={`/trips/${tripId}/expenses`}
      currentParticipantIds={currentParticipants.map(({ userId }) => userId)}
      defaultValues={expenseToFormValues(expenseQuery.data)}
      isPending={updateExpense.isPending}
      onSubmit={submit}
      participants={participants}
      reservations={reservationsQuery.data}
      serverError={serverError}
      submitLabel="Save expense"
    />
  );
}

const linkClasses = "font-semibold text-[var(--primary)] hover:underline";
