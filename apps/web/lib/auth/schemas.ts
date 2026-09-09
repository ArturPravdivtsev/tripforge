import { z } from "zod";

const emailSchema = z
  .string()
  .trim()
  .min(1, "Enter your email address.")
  .email("Enter a valid email address.")
  .max(320, "Email address is too long.");

export const registerSchema = z.object({
  displayName: z
    .string()
    .trim()
    .max(100, "Display name must be 100 characters or fewer.")
    .transform((value) => value || undefined)
    .optional(),
  email: emailSchema,
  password: z
    .string()
    .min(15, "Use at least 15 characters.")
    .max(128, "Password must be 128 characters or fewer."),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z
    .string()
    .min(1, "Enter your password.")
    .max(128, "Password must be 128 characters or fewer."),
});

export type RegisterFormValues = z.input<typeof registerSchema>;
export type LoginFormValues = z.input<typeof loginSchema>;
