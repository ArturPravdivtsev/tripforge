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
import { loginSchema, type LoginFormValues } from "@/lib/auth/schemas";

function loginErrorMessage(error: unknown): string {
  if (
    error instanceof ApiClientError &&
    (error.status === 429 || error.code === "TOO_MANY_REQUESTS")
  ) {
    return "Too many attempts. Please try again later.";
  }

  if (error instanceof ApiClientError && error.code === "INVALID_CREDENTIALS") {
    return "Email or password is incorrect.";
  }

  return "Something went wrong. Please try again.";
}

export function LoginForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState<string>();
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    reset,
  } = useForm<LoginFormValues>({
    defaultValues: { email: "", password: "" },
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(undefined);

    try {
      const parsed = loginSchema.parse(values);
      await authApi.login(parsed);
      await clearAuthenticatedCache(queryClient);
      reset();
      router.replace("/");
      router.refresh();
    } catch (error) {
      setServerError(loginErrorMessage(error));
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
        <Label htmlFor="login-email">Email</Label>
        <Input
          id="login-email"
          type="email"
          autoComplete="username"
          aria-describedby={errors.email ? "login-email-error" : undefined}
          aria-invalid={Boolean(errors.email)}
          disabled={isSubmitting}
          required
          {...register("email")}
        />
        {errors.email ? (
          <p id="login-email-error" className="text-sm text-[var(--danger)]">
            {errors.email.message}
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="login-password">Password</Label>
        <Input
          id="login-password"
          type="password"
          autoComplete="current-password"
          aria-describedby={errors.password ? "login-password-error" : undefined}
          aria-invalid={Boolean(errors.password)}
          disabled={isSubmitting}
          required
          {...register("password")}
        />
        {errors.password ? (
          <p id="login-password-error" className="text-sm text-[var(--danger)]">
            {errors.password.message}
          </p>
        ) : null}
      </div>

      <Button className="w-full" type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Signing in…" : "Sign in"}
      </Button>

      <p className="text-center text-sm text-[var(--muted-foreground)]">
        New to TripForge?{" "}
        <Link className="font-semibold text-[var(--primary)] hover:underline" href="/register">
          Create account
        </Link>
      </p>
    </form>
  );
}
