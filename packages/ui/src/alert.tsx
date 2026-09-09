import type { ComponentPropsWithoutRef } from "react";

import { joinClassNames } from "./class-names";

export function Alert({
  className,
  ...props
}: ComponentPropsWithoutRef<"div">) {
  return (
    <div
      className={joinClassNames(
        "rounded-[var(--radius-md)] border border-[var(--danger)] bg-red-50 px-4 py-3 text-sm text-[var(--danger)]",
        className,
      )}
      {...props}
    />
  );
}
