import {
  isSupportedCurrency,
  parseMajorAmountToMinor,
} from "@tripforge/contracts";
import { z } from "zod";
import "@/lib/security/zod-csp";

import { isCalendarDate } from "./calendar-date";

export const expenseFormSchema = z
  .object({
    amount: z.string(),
    category: z.enum([
      "accommodation",
      "transport",
      "food",
      "activity",
      "shopping",
      "other",
    ]),
    currency: z.string(),
    customAmounts: z.record(z.string(), z.string()),
    notes: z.string().trim().max(5000, "Notes must be 5000 characters or fewer."),
    paidByUserId: z.string().min(1, "Choose who paid."),
    participantUserIds: z.array(z.string()),
    reservationId: z.string(),
    spentOn: z.string().refine(isCalendarDate, "Enter a valid expense date."),
    splitMethod: z.enum(["equal", "custom"]),
    title: z
      .string()
      .trim()
      .min(1, "Enter an expense title.")
      .max(200, "Title must be 200 characters or fewer."),
  })
  .superRefine((values, context) => {
    if (!isSupportedCurrency(values.currency)) {
      context.addIssue({
        code: "custom",
        message: "Choose a supported currency.",
        path: ["currency"],
      });
      return;
    }
    const amountMinor = parseMajorAmountToMinor(values.amount, values.currency);
    if (amountMinor === null || amountMinor <= 0) {
      context.addIssue({
        code: "custom",
        message: "Enter a positive amount using the currency's exact decimal digits.",
        path: ["amount"],
      });
    }
    if (
      values.participantUserIds.length === 0 ||
      new Set(values.participantUserIds).size !== values.participantUserIds.length
    ) {
      context.addIssue({
        code: "custom",
        message: "Choose at least one unique split participant.",
        path: ["participantUserIds"],
      });
    }
    if (values.splitMethod !== "custom" || amountMinor === null) return;

    let allocated = 0;
    for (const userId of values.participantUserIds) {
      const share = parseMajorAmountToMinor(
        values.customAmounts[userId] ?? "",
        values.currency,
      );
      if (share === null) {
        context.addIssue({
          code: "custom",
          message: "Enter an exact non-negative share.",
          path: ["customAmounts", userId],
        });
        continue;
      }
      allocated += share;
      if (!Number.isSafeInteger(allocated)) {
        context.addIssue({
          code: "custom",
          message: "Allocated amount exceeds the safe integer range.",
          path: ["customAmounts", userId],
        });
      }
    }
    if (Number.isSafeInteger(allocated) && allocated !== amountMinor) {
      context.addIssue({
        code: "custom",
        message: "Custom shares must exactly match the expense amount.",
        path: ["participantUserIds"],
      });
    }
  });

export type ExpenseFormValues = z.input<typeof expenseFormSchema>;
