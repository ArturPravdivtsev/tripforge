import { describe, expect, it } from "vitest";
import { z } from "zod";
import "./zod-csp";

describe("CSP-safe validation", () => {
  it("disables eval before schema construction without changing validation", () => {
    expect(z.config().jitless).toBe(true);
    const schema = z.object({ name: z.string().min(1) });
    expect(schema.safeParse({ name: "Museum" }).success).toBe(true);
    expect(schema.safeParse({ name: "" }).success).toBe(false);
  });
});
