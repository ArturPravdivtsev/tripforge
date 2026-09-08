import type { ComponentPropsWithoutRef } from "react";

import { joinClassNames } from "./class-names";

export function Card({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  return (
    <div
      className={joinClassNames(
        "rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-card)]",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({
  className,
  ...props
}: ComponentPropsWithoutRef<"div">) {
  return (
    <div
      className={joinClassNames("space-y-3 p-6", className)}
      {...props}
    />
  );
}

export function CardTitle({
  className,
  ...props
}: ComponentPropsWithoutRef<"h3">) {
  return (
    <h3
      className={joinClassNames(
        "text-xl font-semibold tracking-tight",
        className,
      )}
      {...props}
    />
  );
}

export function CardDescription({
  className,
  ...props
}: ComponentPropsWithoutRef<"p">) {
  return (
    <p
      className={joinClassNames(
        "leading-7 text-[var(--muted-foreground)]",
        className,
      )}
      {...props}
    />
  );
}

export function CardContent({
  className,
  ...props
}: ComponentPropsWithoutRef<"div">) {
  return (
    <div
      className={joinClassNames("px-6 pb-6", className)}
      {...props}
    />
  );
}
