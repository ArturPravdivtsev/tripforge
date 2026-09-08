import type { ComponentPropsWithoutRef } from "react";

import { joinClassNames } from "./class-names";

export function Container({
  className,
  ...props
}: ComponentPropsWithoutRef<"div">) {
  return (
    <div
      className={joinClassNames(
        "mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8",
        className,
      )}
      {...props}
    />
  );
}
