"use client";

import { useId } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Alert, Button, Input, Label, Textarea } from "@tripforge/ui";
import { useForm } from "react-hook-form";

import {
  itineraryItemFormSchema,
  type ItineraryItemFormValues,
} from "@/lib/trips/schemas";

type ItineraryItemFormProps = Readonly<{
  defaultValues: ItineraryItemFormValues;
  isPending: boolean;
  onCancel: () => void;
  onSubmit: (values: ItineraryItemFormValues) => Promise<void>;
  serverError?: string;
  submitLabel: string;
}>;

export function ItineraryItemForm({
  defaultValues,
  isPending,
  onCancel,
  onSubmit,
  serverError,
  submitLabel,
}: ItineraryItemFormProps) {
  const formId = useId();
  const {
    formState: { errors },
    handleSubmit,
    register,
  } = useForm<ItineraryItemFormValues>({
    defaultValues,
    resolver: zodResolver(itineraryItemFormSchema),
  });

  return (
    <form
      aria-busy={isPending}
      className="space-y-4 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-4"
      noValidate
      onSubmit={handleSubmit(onSubmit)}
    >
      {serverError ? <Alert role="alert">{serverError}</Alert> : null}

      <div className="space-y-2">
        <Label htmlFor={`${formId}-title`}>Title</Label>
        <Input
          id={`${formId}-title`}
          autoComplete="off"
          aria-describedby={errors.title ? `${formId}-title-error` : undefined}
          aria-invalid={Boolean(errors.title)}
          disabled={isPending}
          {...register("title")}
        />
        {errors.title ? (
          <p id={`${formId}-title-error`} className="text-sm text-[var(--danger)]">
            {errors.title.message}
          </p>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`${formId}-kind`}>Type</Label>
          <select
            id={`${formId}-kind`}
            className={selectClasses}
            disabled={isPending}
            {...register("kind")}
          >
            <option value="activity">Activity</option>
            <option value="food">Food</option>
            <option value="transport">Transport</option>
            <option value="accommodation">Accommodation</option>
            <option value="other">Other</option>
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor={`${formId}-start-time`}>Start time</Label>
          <Input
            id={`${formId}-start-time`}
            type="time"
            aria-describedby={errors.startTime ? `${formId}-time-error` : undefined}
            aria-invalid={Boolean(errors.startTime)}
            disabled={isPending}
            {...register("startTime")}
          />
          {errors.startTime ? (
            <p id={`${formId}-time-error`} className="text-sm text-[var(--danger)]">
              {errors.startTime.message}
            </p>
          ) : null}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${formId}-notes`}>Notes</Label>
        <Textarea
          id={`${formId}-notes`}
          aria-describedby={errors.notes ? `${formId}-notes-error` : undefined}
          aria-invalid={Boolean(errors.notes)}
          disabled={isPending}
          {...register("notes")}
        />
        {errors.notes ? (
          <p id={`${formId}-notes-error`} className="text-sm text-[var(--danger)]">
            {errors.notes.message}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" disabled={isPending} variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}

const selectClasses =
  "min-h-11 w-full min-w-0 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[var(--foreground)] shadow-sm focus-visible:border-[var(--primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-50";
