import type { ComponentPropsWithRef } from "react";

import { joinClassNames } from "./class-names";

const variantClasses = {
  default:
    "bg-[var(--primary)] text-[var(--primary-foreground)] shadow-sm hover:brightness-95",
  secondary:
    "bg-[var(--surface-muted)] text-[var(--foreground)] hover:bg-[var(--muted)]",
  ghost:
    "bg-transparent text-[var(--foreground)] hover:bg-[var(--surface-muted)]",
} as const;

const sizeClasses = {
  default: "min-h-11 px-5 py-2.5",
  sm: "min-h-10 px-3 py-1.5 text-sm",
} as const;

export type ButtonProps = ComponentPropsWithRef<"button"> & {
  size?: keyof typeof sizeClasses;
  variant?: keyof typeof variantClasses;
};

export function Button({
  className,
  ref,
  size = "default",
  type = "button",
  variant = "default",
  ...props
}: ButtonProps) {
  return (
    <button
      ref={ref}
      type={type}
      className={joinClassNames(
        "inline-flex items-center justify-center rounded-[var(--radius-md)] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)] disabled:cursor-not-allowed disabled:opacity-50",
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...props}
    />
  );
}
