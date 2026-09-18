import { describe, expect, it } from "vitest";

import { formatRouteDistance, formatRouteDuration } from "./route-format";

describe("route formatting", () => {
  it.each([[850, "850 m"], [2_400, "2.4 km"], [412_000, "412 km"]])(
    "formats %s meters",
    (value, expected) => expect(formatRouteDistance(value)).toBe(expected),
  );

  it.each([[480, "8 min"], [1_860, "31 min"], [4_320, "1 h 12 min"], [18_000, "5 h"]])(
    "formats %s seconds",
    (value, expected) => expect(formatRouteDuration(value)).toBe(expected),
  );
});
