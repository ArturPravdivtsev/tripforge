import { describe, expect, it } from "vitest";

import {
  generateSessionToken,
  hashSessionToken,
  SESSION_TOKEN_BYTES,
} from "./session-token";

describe("session token operations", () => {
  it("generates distinct tokens with 256 bits of random material", () => {
    const firstToken = generateSessionToken();
    const secondToken = generateSessionToken();

    expect(firstToken).not.toBe(secondToken);
    expect(Buffer.from(firstToken, "base64url")).toHaveLength(
      SESSION_TOKEN_BYTES,
    );
  });

  it("hashes tokens deterministically as lowercase SHA-256 hex", () => {
    const firstHash = hashSessionToken("first-token");

    expect(firstHash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashSessionToken("first-token")).toBe(firstHash);
    expect(hashSessionToken("second-token")).not.toBe(firstHash);
  });
});
