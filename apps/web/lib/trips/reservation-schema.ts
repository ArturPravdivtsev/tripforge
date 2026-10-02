import { z } from "zod";
import "@/lib/security/zod-csp";

import { isCalendarDate } from "./calendar-date";

const optionalText = (maximum: number, message: string) =>
  z.string().trim().max(maximum, message);
const time = z.string().refine(
  (value) => value === "" || /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value),
  "Enter a valid time in HH:mm format.",
);

export const reservationFormSchema = z
  .object({
    confirmationCode: optionalText(120, "Confirmation code is too long."),
    endDate: z
      .string()
      .refine(
        (value) => value === "" || isCalendarDate(value),
        "Enter a valid end date.",
      ),
    endTime: time,
    itineraryItemId: z.string(),
    kind: z.enum([
      "accommodation",
      "transport",
      "restaurant",
      "activity",
      "other",
    ]),
    locationName: optionalText(200, "Location must be 200 characters or fewer."),
    notes: optionalText(5000, "Notes must be 5000 characters or fewer."),
    providerName: optionalText(160, "Provider must be 160 characters or fewer."),
    startDate: z
      .string()
      .refine(isCalendarDate, "Enter a valid start date."),
    startTime: time,
    status: z.enum(["pending", "confirmed", "cancelled"]),
    title: z
      .string()
      .trim()
      .min(1, "Enter a reservation title.")
      .max(200, "Title must be 200 characters or fewer."),
    transport: z.object({
      destinationName: optionalText(200, "Destination is too long."),
      mode: z.enum(["flight", "train", "bus", "ferry", "other"]),
      operatorName: optionalText(160, "Operator is too long."),
      originName: optionalText(200, "Origin is too long."),
      serviceNumber: optionalText(120, "Service number is too long."),
    }),
  })
  .superRefine((values, context) => {
    if (values.endTime && !values.endDate) {
      context.addIssue({
        code: "custom",
        message: "Choose an end date before adding an end time.",
        path: ["endDate"],
      });
    }
    if (values.endDate && values.endDate < values.startDate) {
      context.addIssue({
        code: "custom",
        message: "End date cannot be before start date.",
        path: ["endDate"],
      });
    }
    if (
      values.endDate === values.startDate &&
      values.startTime &&
      values.endTime &&
      values.endTime < values.startTime
    ) {
      context.addIssue({
        code: "custom",
        message: "End time cannot be before start time on the same date.",
        path: ["endTime"],
      });
    }
    if (values.kind === "transport") {
      if (!values.transport.originName) {
        context.addIssue({
          code: "custom",
          message: "Enter an origin.",
          path: ["transport", "originName"],
        });
      }
      if (!values.transport.destinationName) {
        context.addIssue({
          code: "custom",
          message: "Enter a destination.",
          path: ["transport", "destinationName"],
        });
      }
    }
  });

export type ReservationFormValues = z.input<typeof reservationFormSchema>;
