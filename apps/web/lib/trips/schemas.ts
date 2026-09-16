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

export const memberFormSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, "Enter an email address.")
    .email("Enter a valid email address.")
    .max(320, "Email address is too long."),
  role: z.enum(["editor", "viewer"]),
});

export type MemberFormValues = z.input<typeof memberFormSchema>;
