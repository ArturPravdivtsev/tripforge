"use client";

import Link from "next/link";
import { zodResolver } from "@hookform/resolvers/zod";
import { Alert, Button, Input, Label } from "@tripforge/ui";
import { useForm } from "react-hook-form";

import {
  tripFormSchema,
  type TripFormValues,
} from "@/lib/trips/schemas";

type TripFormProps = Readonly<{
  defaultValues: TripFormValues;
  isPending: boolean;
  onSubmit: (values: TripFormValues) => Promise<void>;
  pendingLabel: string;
  serverError?: string;
  submitLabel: string;
}>;

export function TripForm({
  defaultValues,
  isPending,
  onSubmit,
  pendingLabel,
  serverError,
  submitLabel,
}: TripFormProps) {
  const {
    formState: { errors },
    handleSubmit,
    register,
  } = useForm<TripFormValues>({
    defaultValues,
    resolver: zodResolver(tripFormSchema),
  });

  return (
    <form
      aria-busy={isPending}
      className="space-y-5"
      noValidate
      onSubmit={handleSubmit(onSubmit)}
    >
      {serverError ? <Alert role="alert">{serverError}</Alert> : null}

      <div className="space-y-2">
        <Label htmlFor="trip-name">Name</Label>
        <Input
          id="trip-name"
          type="text"
          autoComplete="off"
          aria-describedby={errors.name ? "trip-name-error" : undefined}
          aria-invalid={Boolean(errors.name)}
          disabled={isPending}
          required
          {...register("name")}
        />
        {errors.name ? (
          <p id="trip-name-error" className="text-sm text-[var(--danger)]">
            {errors.name.message}
          </p>
        ) : null}
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="trip-starts-on">Start date</Label>
          <Input
            id="trip-starts-on"
            type="date"
            aria-describedby={
              errors.startsOn ? "trip-starts-on-error" : undefined
            }
            aria-invalid={Boolean(errors.startsOn)}
            disabled={isPending}
            {...register("startsOn")}
          />
          {errors.startsOn ? (
            <p
              id="trip-starts-on-error"
              className="text-sm text-[var(--danger)]"
            >
              {errors.startsOn.message}
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="trip-ends-on">End date</Label>
          <Input
            id="trip-ends-on"
            type="date"
            aria-describedby={errors.endsOn ? "trip-ends-on-error" : undefined}
            aria-invalid={Boolean(errors.endsOn)}
            disabled={isPending}
            {...register("endsOn")}
          />
          {errors.endsOn ? (
            <p id="trip-ends-on-error" className="text-sm text-[var(--danger)]">
              {errors.endsOn.message}
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Link
          className="inline-flex min-h-11 items-center justify-center rounded-[var(--radius-md)] bg-[var(--surface-muted)] px-5 py-2.5 font-semibold transition hover:bg-[var(--muted)]"
          href="/trips"
        >
          Cancel
        </Link>
        <Button type="submit" disabled={isPending}>
          {isPending ? pendingLabel : submitLabel}
        </Button>
      </div>
    </form>
  );
}
