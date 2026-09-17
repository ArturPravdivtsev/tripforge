import type { ComponentPropsWithRef } from "react";

import { joinClassNames } from "./class-names";

export function Textarea({
  className,
  ref,
  ...props
}: ComponentPropsWithRef<"textarea">) {
  return (
    <textarea
      ref={ref}
      className={joinClassNames(
        "min-h-24 w-full resize-y rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[var(--foreground)] shadow-sm transition placeholder:text-[var(--muted-foreground)] focus-visible:border-[var(--primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-[var(--danger)]",
        className,
      )}
      {...props}
    />
  );
}
