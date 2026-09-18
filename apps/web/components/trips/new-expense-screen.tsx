"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ExpenseParticipant } from "@tripforge/contracts";
import { Button } from "@tripforge/ui";

import { ApiClientError } from "@/lib/api/errors";
import { tripsApi } from "@/lib/api/trips";
import {
  emptyExpenseForm,
  toCreateExpenseRequest,
} from "@/lib/trips/expense-form-values";
import type { ExpenseFormValues } from "@/lib/trips/expense-schema";
import { tripKeys } from "@/lib/trips/query-keys";

import { ExpenseForm } from "./expense-form";
import { ExpenseScreenState } from "./expense-screen-state";

export function NewExpenseScreen({ tripId }: Readonly<{ tripId: string }>) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState<string>();
  const tripQuery = useQuery({
    queryFn: ({ signal }) => tripsApi.get(tripId, { signal }),
    queryKey: tripKeys.detail(tripId),
  });
  const membersQuery = useQuery({
    queryFn: ({ signal }) => tripsApi.listMembers(tripId, { signal }),
    queryKey: tripKeys.members(tripId),
  });
  const reservationsQuery = useQuery({
    queryFn: ({ signal }) => tripsApi.listReservations(tripId, { signal }),
    queryKey: tripKeys.reservations(tripId),
  });
  const createExpense = useMutation({
    mutationFn: (values: ExpenseFormValues) =>
      tripsApi.createExpense(tripId, toCreateExpenseRequest(values)),
    onSuccess: async () => {
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

  if (tripQuery.isPending || membersQuery.isPending || reservationsQuery.isPending) {
    return <ExpenseScreenState loading title="Loading expense form…" />;
  }
  const queryError = tripQuery.error ?? membersQuery.error ?? reservationsQuery.error;
  if (queryError instanceof ApiClientError && queryError.status === 401) {
    return (
      <ExpenseScreenState title="Sign in to create an expense.">
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
  if (queryError || !tripQuery.data || !membersQuery.data || !reservationsQuery.data) {
    return (
      <ExpenseScreenState title="Unable to load the expense form.">
        <Button variant="secondary" onClick={() => void tripQuery.refetch()}>
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

  const participants = membersQuery.data.map(toExpenseParticipant);

  async function submit(values: ExpenseFormValues) {
    setServerError(undefined);
    try {
      await createExpense.mutateAsync(values);
    } catch (error) {
      setServerError(expenseMutationError(error));
    }
  }

  return (
    <ExpenseForm
      cancelHref={`/trips/${tripId}/expenses`}
      currentParticipantIds={participants.map(({ userId }) => userId)}
      defaultValues={emptyExpenseForm(
        participants,
        tripQuery.data.startsOn ?? new Date().toISOString().slice(0, 10),
      )}
      isPending={createExpense.isPending}
      onSubmit={submit}
      participants={participants}
      reservations={reservationsQuery.data}
      serverError={serverError}
      submitLabel="Create expense"
    />
  );
}

export function toExpenseParticipant({
  user,
}: Awaited<ReturnType<typeof tripsApi.listMembers>>[number]): ExpenseParticipant {
  return {
    displayName: user.displayName,
    email: user.email,
    userId: user.id,
  };
}

export function expenseMutationError(error: unknown): string {
  if (
    error instanceof ApiClientError &&
    [
      "INVALID_EXPENSE_SPLIT",
      "TRIP_PARTICIPANT_NOT_FOUND",
      "RESERVATION_NOT_FOUND",
      "UNSUPPORTED_CURRENCY",
    ].includes(error.code)
  ) {
    return "Check the amount, participants, currency and reservation, then try again.";
  }
  return "Unable to save expense. Please try again.";
}

const linkClasses = "font-semibold text-[var(--primary)] hover:underline";
