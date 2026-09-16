import { z } from "zod";

import { isCalendarDate } from "./calendar-date";

const optionalCalendarDate = z.string().refine(
  (value) => value === "" || isCalendarDate(value),
  "Enter a valid date.",
);

export const tripFormSchema = z
  .object({
    endsOn: optionalCalendarDate,
    name: z
      .string()
      .trim()
      .min(1, "Enter a trip name.")
      .max(200, "Trip name must be 200 characters or fewer."),
    startsOn: optionalCalendarDate,
  })
  .refine(
    ({ endsOn, startsOn }) => !startsOn || !endsOn || endsOn >= startsOn,
    {
      message: "End date cannot be before start date.",
      path: ["endsOn"],
    },
  );

export type TripFormValues = z.input<typeof tripFormSchema>;
