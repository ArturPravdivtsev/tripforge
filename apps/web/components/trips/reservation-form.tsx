"use client";

import Link from "next/link";
import { useId } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import type { ItineraryItem, TripDay } from "@tripforge/contracts";
import { Alert, Button, Input, Label, Textarea } from "@tripforge/ui";
import { useForm, useWatch } from "react-hook-form";

import {
  reservationFormSchema,
  type ReservationFormValues,
} from "@/lib/trips/reservation-schema";

type ReservationFormProps = Readonly<{
  cancelHref: string;
  days: TripDay[];
  defaultValues: ReservationFormValues;
  isPending: boolean;
  items: ItineraryItem[];
  onSubmit: (values: ReservationFormValues) => Promise<void>;
  serverError?: string;
  submitLabel: string;
}>;

export function ReservationForm({
  cancelHref,
  days,
  defaultValues,
  isPending,
  items,
  onSubmit,
  serverError,
  submitLabel,
}: ReservationFormProps) {
  const formId = useId();
  const {
    control,
    formState: { errors },
    handleSubmit,
    register,
  } = useForm<ReservationFormValues>({
    defaultValues,
    resolver: zodResolver(reservationFormSchema),
  });
  const kind = useWatch({ control, name: "kind" });
  const status = useWatch({ control, name: "status" });
  const dayNumbers = new Map(days.map((day, index) => [day.id, index + 1]));

  return (
    <form
      aria-busy={isPending}
      className="space-y-6"
      noValidate
      onSubmit={handleSubmit(onSubmit)}
    >
      {serverError ? <Alert role="alert">{serverError}</Alert> : null}
      {status === "cancelled" ? (
        <Alert>
          Cancelled only updates this TripForge record. It does not contact the
          booking provider.
        </Alert>
      ) : null}

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Kind" id={`${formId}-kind`} error={errors.kind?.message}>
          <select
            id={`${formId}-kind`}
            className={selectClasses}
            disabled={isPending}
            {...register("kind")}
          >
            <option value="accommodation">Accommodation</option>
            <option value="transport">Transport</option>
            <option value="restaurant">Restaurant</option>
            <option value="activity">Activity</option>
            <option value="other">Other</option>
          </select>
        </Field>
        <Field label="Status" id={`${formId}-status`} error={errors.status?.message}>
          <select
            id={`${formId}-status`}
            className={selectClasses}
            disabled={isPending}
            {...register("status")}
          >
            <option value="pending">Pending</option>
            <option value="confirmed">Confirmed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </Field>
      </div>

      <Field label="Title" id={`${formId}-title`} error={errors.title?.message}>
        <Input
          id={`${formId}-title`}
          autoComplete="off"
          aria-invalid={Boolean(errors.title)}
          disabled={isPending}
          {...register("title")}
        />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          label="Provider"
          id={`${formId}-provider`}
          error={errors.providerName?.message}
        >
          <Input
            id={`${formId}-provider`}
            autoComplete="organization"
            disabled={isPending}
            {...register("providerName")}
          />
        </Field>
        <Field
          label="Confirmation code"
          id={`${formId}-confirmation`}
          error={errors.confirmationCode?.message}
        >
          <Input
            id={`${formId}-confirmation`}
            autoComplete="off"
            disabled={isPending}
            {...register("confirmationCode")}
          />
        </Field>
      </div>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <Field
          label="Start date"
          id={`${formId}-start-date`}
          error={errors.startDate?.message}
        >
          <Input
            id={`${formId}-start-date`}
            type="date"
            disabled={isPending}
            {...register("startDate")}
          />
        </Field>
        <Field
          label="Start time"
          id={`${formId}-start-time`}
          error={errors.startTime?.message}
        >
          <Input
            id={`${formId}-start-time`}
            type="time"
            disabled={isPending}
            {...register("startTime")}
          />
        </Field>
        <Field
          label="End date"
          id={`${formId}-end-date`}
          error={errors.endDate?.message}
        >
          <Input
            id={`${formId}-end-date`}
            type="date"
            disabled={isPending}
            {...register("endDate")}
          />
        </Field>
        <Field
          label="End time"
          id={`${formId}-end-time`}
          error={errors.endTime?.message}
        >
          <Input
            id={`${formId}-end-time`}
            type="time"
            disabled={isPending}
            {...register("endTime")}
          />
        </Field>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          label="Location"
          id={`${formId}-location`}
          error={errors.locationName?.message}
        >
          <Input
            id={`${formId}-location`}
            autoComplete="off"
            disabled={isPending}
            {...register("locationName")}
          />
        </Field>
        <Field
          label="Linked itinerary item"
          id={`${formId}-item`}
          error={errors.itineraryItemId?.message}
        >
          <select
            id={`${formId}-item`}
            className={selectClasses}
            disabled={isPending}
            {...register("itineraryItemId")}
          >
            <option value="">Not linked to itinerary</option>
            {items.map((item) => (
              <option key={item.id} value={item.id}>
                {formatItemLabel(item, dayNumbers)}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {kind === "transport" ? (
        <fieldset className="space-y-5 rounded-[var(--radius-md)] border border-[var(--border)] p-4">
          <legend className="px-1 font-semibold">Transport details</legend>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <Field
              label="Mode"
              id={`${formId}-transport-mode`}
              error={errors.transport?.mode?.message}
            >
              <select
                id={`${formId}-transport-mode`}
                className={selectClasses}
                disabled={isPending}
                {...register("transport.mode")}
              >
                <option value="flight">Flight</option>
                <option value="train">Train</option>
                <option value="bus">Bus</option>
                <option value="ferry">Ferry</option>
                <option value="other">Other</option>
              </select>
            </Field>
            <Field
              label="Operator"
              id={`${formId}-operator`}
              error={errors.transport?.operatorName?.message}
            >
              <Input
                id={`${formId}-operator`}
                disabled={isPending}
                {...register("transport.operatorName")}
              />
            </Field>
            <Field
              label="Service number"
              id={`${formId}-service`}
              error={errors.transport?.serviceNumber?.message}
            >
              <Input
                id={`${formId}-service`}
                disabled={isPending}
                {...register("transport.serviceNumber")}
              />
            </Field>
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              label="Origin"
              id={`${formId}-origin`}
              error={errors.transport?.originName?.message}
            >
              <Input
                id={`${formId}-origin`}
                disabled={isPending}
                {...register("transport.originName")}
              />
            </Field>
            <Field
              label="Destination"
              id={`${formId}-destination`}
              error={errors.transport?.destinationName?.message}
            >
              <Input
                id={`${formId}-destination`}
                disabled={isPending}
                {...register("transport.destinationName")}
              />
            </Field>
          </div>
        </fieldset>
      ) : null}

      <Field label="Notes" id={`${formId}-notes`} error={errors.notes?.message}>
        <Textarea
          id={`${formId}-notes`}
          disabled={isPending}
          {...register("notes")}
        />
      </Field>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Link className={cancelClasses} href={cancelHref}>
          Cancel
        </Link>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving…" : submitLabel}
        </Button>
      </div>
    </form>
  );
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
      {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
    </div>
  );
}

function formatItemLabel(item: ItineraryItem, dayNumbers: Map<string, number>) {
  const day = dayNumbers.get(item.dayId) ?? "?";
  return `Day ${day} · ${item.startTime ?? "Any time"} · ${item.title}`;
}

const selectClasses =
  "min-h-11 w-full min-w-0 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[var(--foreground)] shadow-sm focus-visible:border-[var(--primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-50";
const cancelClasses =
  "inline-flex min-h-11 items-center justify-center rounded-[var(--radius-md)] bg-[var(--surface-muted)] px-5 py-2.5 font-semibold transition hover:bg-[var(--muted)]";
