"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { Alert, Button, Input, Label } from "@tripforge/ui";
import { useForm } from "react-hook-form";

import { authApi } from "@/lib/api/auth";
import { ApiClientError } from "@/lib/api/errors";
import { clearAuthenticatedCache } from "@/lib/auth/cache";
import {
  registerSchema,
  type RegisterFormValues,
} from "@/lib/auth/schemas";

function registerErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError && error.code === "ACCOUNT_ALREADY_EXISTS") {
    return "An account with this email already exists.";
  }

  return "Something went wrong. Please try again.";
}

export function RegisterForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState<string>();
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    reset,
  } = useForm<RegisterFormValues>({
    defaultValues: { displayName: "", email: "", password: "" },
    resolver: zodResolver(registerSchema),
  });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(undefined);

    try {
      const parsed = registerSchema.parse(values);
      await authApi.register(parsed);
      await clearAuthenticatedCache(queryClient);
      reset();
      router.replace("/");
      router.refresh();
    } catch (error) {
      setServerError(registerErrorMessage(error));
    }
  });

  return (
    <form
      className="space-y-5"
      onSubmit={onSubmit}
      aria-busy={isSubmitting}
      noValidate
    >
      {serverError ? <Alert role="alert">{serverError}</Alert> : null}

      <div className="space-y-2">
        <Label htmlFor="display-name">Display name</Label>
        <Input
          id="display-name"
          type="text"
          autoComplete="name"
          aria-describedby={errors.displayName ? "display-name-error" : undefined}
          aria-invalid={Boolean(errors.displayName)}
          disabled={isSubmitting}
          required
          {...register("displayName")}
        />
        {errors.displayName ? (
          <p id="display-name-error" className="text-sm text-[var(--danger)]">
            {errors.displayName.message}
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="register-email">Email</Label>
        <Input
          id="register-email"
          type="email"
          autoComplete="email"
          aria-describedby={errors.email ? "register-email-error" : undefined}
          aria-invalid={Boolean(errors.email)}
          disabled={isSubmitting}
          required
          {...register("email")}
        />
        {errors.email ? (
          <p id="register-email-error" className="text-sm text-[var(--danger)]">
            {errors.email.message}
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="register-password">Password</Label>
        <Input
          id="register-password"
          type="password"
          autoComplete="new-password"
          aria-describedby={
            errors.password
              ? "register-password-help register-password-error"
              : "register-password-help"
          }
          aria-invalid={Boolean(errors.password)}
          disabled={isSubmitting}
          required
          {...register("password")}
        />
        <p id="register-password-help" className="text-sm text-[var(--muted-foreground)]">
          Use at least 15 characters.
        </p>
        {errors.password ? (
          <p id="register-password-error" className="text-sm text-[var(--danger)]">
            {errors.password.message}
          </p>
        ) : null}
      </div>

      <Button className="w-full" type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Creating account…" : "Create account"}
      </Button>

      <p className="text-center text-sm text-[var(--muted-foreground)]">
        Already have an account?{" "}
        <Link className="font-semibold text-[var(--primary)] hover:underline" href="/login">
          Sign in
        </Link>
      </p>
    </form>
  );
}
