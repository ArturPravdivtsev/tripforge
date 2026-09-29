"use client";

import Link from "next/link";
import { useId } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import type { ExpenseParticipant, TripReservation } from "@tripforge/contracts";
import {
  allocateEqualSplit,
  formatMinorAmount,
  getCurrencyMinorUnitDigits,
  getSupportedCurrencyCodes,
  parseMajorAmountToMinor,
} from "@tripforge/contracts";
import { Alert, Button, Input, Label, Textarea } from "@tripforge/ui";
import { useForm, useWatch } from "react-hook-form";

import {
  expenseFormSchema,
  type ExpenseFormValues,
} from "@/lib/trips/expense-schema";

type ExpenseFormProps = Readonly<{
  cancelHref: string;
  currentParticipantIds: readonly string[];
  defaultValues: ExpenseFormValues;
  isPending: boolean;
  onSubmit: (values: ExpenseFormValues) => Promise<void>;
  participants: readonly ExpenseParticipant[];
  reservations: readonly TripReservation[];
  serverError?: string;
  submitLabel: string;
}>;

const currencyCodes = getSupportedCurrencyCodes();

export function ExpenseForm({
  cancelHref,
  currentParticipantIds,
  defaultValues,
  isPending,
  onSubmit,
  participants,
  reservations,
  serverError,
  submitLabel,
}: ExpenseFormProps) {
  const formId = useId();
  const {
    control,
    formState: { errors },
    handleSubmit,
    register,
  } = useForm<ExpenseFormValues>({
    defaultValues,
    mode: "onChange",
    resolver: zodResolver(expenseFormSchema),
  });
  const amount = useWatch({ control, name: "amount" });
  const currency = useWatch({ control, name: "currency" });
  const customAmounts = useWatch({ control, name: "customAmounts" });
  const participantUserIds = useWatch({
    control,
    name: "participantUserIds",
  });
  const splitMethod = useWatch({ control, name: "splitMethod" });
  const currentIds = new Set(currentParticipantIds);
  const amountMinor = parseMajorAmountToMinor(amount, currency);
  const splitPreview = buildSplitPreview(
    amountMinor,
    currency,
    customAmounts,
    participantUserIds,
    splitMethod,
  );
  const customMismatch =
    splitMethod === "custom" &&
    (amountMinor === null || splitPreview.allocatedMinor !== amountMinor);
  const minorUnitDigits = getCurrencyMinorUnitDigits(currency);

  return (
    <form
      aria-busy={isPending}
      className="space-y-6"
      noValidate
      onSubmit={handleSubmit(onSubmit)}
    >
      {serverError ? <Alert role="alert">{serverError}</Alert> : null}

      <Field label="Title" id={`${formId}-title`} error={errors.title?.message}>
        <Input
          id={`${formId}-title`}
          autoComplete="off"
          aria-describedby={errors.title ? `${formId}-title-error` : undefined}
          aria-invalid={Boolean(errors.title)}
          disabled={isPending}
          required
          {...register("title")}
        />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Category" id={`${formId}-category`} error={errors.category?.message}>
          <select
            id={`${formId}-category`}
            className={selectClasses}
            disabled={isPending}
            aria-describedby={errors.category ? `${formId}-category-error` : undefined}
            aria-invalid={Boolean(errors.category)}
            {...register("category")}
          >
            <option value="accommodation">Accommodation</option>
            <option value="transport">Transport</option>
            <option value="food">Food</option>
            <option value="activity">Activity</option>
            <option value="shopping">Shopping</option>
            <option value="other">Other</option>
          </select>
        </Field>
        <Field label="Date" id={`${formId}-date`} error={errors.spentOn?.message}>
          <Input
            id={`${formId}-date`}
            type="date"
            aria-describedby={errors.spentOn ? `${formId}-date-error` : undefined}
            aria-invalid={Boolean(errors.spentOn)}
            disabled={isPending}
            {...register("spentOn")}
          />
        </Field>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Currency" id={`${formId}-currency`} error={errors.currency?.message}>
          <select
            id={`${formId}-currency`}
            className={selectClasses}
            disabled={isPending}
            aria-describedby={errors.currency ? `${formId}-currency-error` : undefined}
            aria-invalid={Boolean(errors.currency)}
            {...register("currency")}
          >
            {currencyCodes.map((code) => (
              <option key={code} value={code}>{code}</option>
            ))}
          </select>
        </Field>
        <Field label="Amount" id={`${formId}-amount`} error={errors.amount?.message}>
          <Input
            id={`${formId}-amount`}
            autoComplete="off"
            aria-describedby={`${formId}-amount-help${errors.amount ? ` ${formId}-amount-error` : ""}`}
            aria-invalid={Boolean(errors.amount)}
            inputMode="decimal"
            placeholder="12.50"
            disabled={isPending}
            required
            {...register("amount")}
          />
        </Field>
      </div>
      <p className="text-sm text-[var(--muted-foreground)]" id={`${formId}-amount-help`}>
        {minorUnitDigits === 0
          ? `${currency} uses whole amounts and does not support decimal minor units.`
          : `${currency} allows up to ${minorUnitDigits} decimal ${minorUnitDigits === 1 ? "place" : "places"}.`} {" "}
        Use a period as the decimal separator. Changing currency does not convert the amount.
      </p>

      <Field label="Paid by" id={`${formId}-payer`} error={errors.paidByUserId?.message}>
        <select
          id={`${formId}-payer`}
          className={selectClasses}
          disabled={isPending}
          aria-describedby={errors.paidByUserId ? `${formId}-payer-error` : undefined}
          aria-invalid={Boolean(errors.paidByUserId)}
          {...register("paidByUserId")}
        >
          {participants.map((participant) => (
            <option key={participant.userId} value={participant.userId}>
              {participantLabel(participant)}
              {currentIds.has(participant.userId) ? "" : " · Former participant"}
            </option>
          ))}
        </select>
      </Field>

      <fieldset
        aria-describedby={errors.participantUserIds?.message ? `${formId}-participants-error` : undefined}
        className="space-y-4 rounded-[var(--radius-md)] border border-[var(--border)] p-4"
      >
        <legend className="px-1 font-semibold">Split</legend>
        <div className="flex flex-wrap gap-5">
          <label className="flex min-h-11 items-center gap-2">
            <input type="radio" value="equal" disabled={isPending} {...register("splitMethod")} />
            Equal
          </label>
          <label className="flex min-h-11 items-center gap-2">
            <input type="radio" value="custom" disabled={isPending} {...register("splitMethod")} />
            Custom
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {participants.map((participant) => {
            const selected = participantUserIds.includes(participant.userId);
            return (
              <div
                className="min-w-0 rounded-[var(--radius-md)] bg-[var(--surface-muted)] p-3"
                key={participant.userId}
              >
                <label className="flex min-h-11 min-w-0 items-center gap-3">
                  <input
                    type="checkbox"
                    value={participant.userId}
                    disabled={isPending}
                    {...register("participantUserIds")}
                  />
                  <span className="min-w-0 flex-1 truncate">
                    {participantLabel(participant)}
                  </span>
                  {!currentIds.has(participant.userId) ? (
                    <span className="shrink-0 text-xs text-[var(--muted-foreground)]">Former</span>
                  ) : null}
                </label>
                {selected && splitMethod === "custom" ? (
                  <div className="mt-2">
                    <Label htmlFor={`${formId}-share-${participant.userId}`}>
                      Share in {currency}
                    </Label>
                    <Input
                      id={`${formId}-share-${participant.userId}`}
                      className="mt-1"
                      inputMode="decimal"
                      disabled={isPending}
                      {...register(`customAmounts.${participant.userId}`)}
                    />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
        {errors.participantUserIds?.message ? (
          <p className="text-sm font-medium text-[var(--danger)]" id={`${formId}-participants-error`} role="alert">
            {errors.participantUserIds.message}
          </p>
        ) : null}

        {splitPreview.rows.length > 0 ? (
          <div className="space-y-2 border-t border-[var(--border)] pt-4 text-sm">
            {splitPreview.rows.map((row) => (
              <div className="flex min-w-0 justify-between gap-4" key={row.userId}>
                <span className="min-w-0 truncate">
                  {participantLabel(
                    participants.find(({ userId }) => userId === row.userId) ?? {
                      displayName: null,
                      email: row.userId,
                      userId: row.userId,
                    },
                  )}
                </span>
                <span className="shrink-0 font-semibold">{row.display}</span>
              </div>
            ))}
            {splitMethod === "custom" && amountMinor !== null ? (
              <p
                aria-live="polite"
                className={customMismatch ? "font-medium text-[var(--danger)]" : "text-[var(--muted-foreground)]"}
                role="status"
              >
                Allocated {displayMinor(splitPreview.allocatedMinor, currency)} of {displayMinor(amountMinor, currency)}. {displayMinor(Math.abs(amountMinor - splitPreview.allocatedMinor), currency)} {amountMinor >= splitPreview.allocatedMinor ? "remaining" : "over allocated"}.
              </p>
            ) : null}
          </div>
        ) : null}
      </fieldset>

      <Field
        label="Linked reservation"
        id={`${formId}-reservation`}
        error={errors.reservationId?.message}
      >
        <select
          id={`${formId}-reservation`}
          className={selectClasses}
          disabled={isPending}
          aria-describedby={errors.reservationId ? `${formId}-reservation-error` : undefined}
          aria-invalid={Boolean(errors.reservationId)}
          {...register("reservationId")}
        >
          <option value="">Not linked to reservation</option>
          {reservations.map((reservation) => (
            <option key={reservation.id} value={reservation.id}>
              {reservation.title} · {reservation.startDate}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Notes" id={`${formId}-notes`} error={errors.notes?.message}>
        <Textarea
          id={`${formId}-notes`}
          aria-describedby={errors.notes ? `${formId}-notes-error` : undefined}
          aria-invalid={Boolean(errors.notes)}
          rows={4}
          disabled={isPending}
          {...register("notes")}
        />
      </Field>

      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={isPending || customMismatch}>
          {isPending ? "Saving…" : submitLabel}
        </Button>
        <Link className={secondaryLinkClasses} href={cancelHref}>Cancel</Link>
      </div>
    </form>
  );
}

function buildSplitPreview(
  amountMinor: number | null,
  currency: string,
  customAmounts: Record<string, string>,
  participantUserIds: string[],
  splitMethod: ExpenseFormValues["splitMethod"],
) {
  if (amountMinor === null || participantUserIds.length === 0) {
    return { allocatedMinor: 0, rows: [] as Array<{ display: string; userId: string }> };
  }
  const shares =
    splitMethod === "equal"
      ? allocateEqualSplit(amountMinor, participantUserIds)
      : participantUserIds.map((userId) => ({
          amountMinor: parseMajorAmountToMinor(customAmounts[userId] ?? "", currency),
          userId,
        }));
  let allocatedMinor = 0;
  const rows = shares.map((share) => {
    if (share.amountMinor !== null) allocatedMinor += share.amountMinor;
    return {
      display:
        share.amountMinor === null ? "Invalid amount" : displayMinor(share.amountMinor, currency),
      userId: share.userId,
    };
  });
  return { allocatedMinor, rows };
}

function displayMinor(amountMinor: number, currency: string): string {
  try {
    return formatMinorAmount(amountMinor, currency);
  } catch {
    return `${currency} ${amountMinor}`;
  }
}

function participantLabel(participant: ExpenseParticipant): string {
  return participant.displayName || participant.email;
}

function Field({
  children,
  error,
  id,
  label,
}: Readonly<{
  children: React.ReactNode;
  error?: string;
  id: string;
  label: string;
}>) {
  return (
    <div className="min-w-0 space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? <p className="text-sm font-medium text-[var(--danger)]" id={`${id}-error`}>{error}</p> : null}
    </div>
  );
}

const selectClasses =
  "min-h-11 w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60";
const secondaryLinkClasses =
  "inline-flex min-h-11 items-center justify-center rounded-[var(--radius-md)] bg-[var(--surface-muted)] px-4 py-2 font-semibold hover:bg-[var(--muted)]";
