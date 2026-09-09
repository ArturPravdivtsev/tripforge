import type { ComponentPropsWithoutRef } from "react";

import { joinClassNames } from "./class-names";

export function Label({
  className,
  ...props
}: ComponentPropsWithoutRef<"label">) {
  return (
    <label
      className={joinClassNames("text-sm font-semibold", className)}
      {...props}
    />
  );
}
