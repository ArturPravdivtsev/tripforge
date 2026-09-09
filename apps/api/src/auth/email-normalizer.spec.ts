import { describe, expect, it } from "vitest";

import { normalizeEmail } from "./email-normalizer";

describe("normalizeEmail", () => {
  it("trims and lowercases an email address", () => {
    expect(normalizeEmail("  Arthur.Example@Email.COM\t")).toBe(
      "arthur.example@email.com",
    );
  });
});
