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

const optionalWallClockTime = z.string().refine(
  (value) => value === "" || /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value),
  "Enter a valid time in HH:mm format.",
);

export const itineraryItemFormSchema = z.object({
  kind: z.enum(["activity", "food", "transport", "accommodation", "other"]),
  notes: z
    .string()
    .trim()
    .max(5000, "Notes must be 5000 characters or fewer."),
  place: z
    .object({
      address: z.string().trim().max(500).nullable().optional(),
      latitude: z.number().finite().min(-90).max(90),
      longitude: z.number().finite().min(-180).max(180),
      name: z.string().trim().min(1).max(200),
      provider: z.literal("maptiler"),
      providerReference: z.string().trim().max(300).nullable().optional(),
    })
    .nullable(),
  startTime: optionalWallClockTime,
  title: z
    .string()
    .trim()
    .min(1, "Enter a title.")
    .max(200, "Title must be 200 characters or fewer."),
});

export type ItineraryItemFormValues = z.input<typeof itineraryItemFormSchema>;
