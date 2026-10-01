import { describe, expect, it } from "vitest";

import { normalizeClientIp } from "./ip-normalizer";

describe("normalizeClientIp", () => {
  it("preserves IPv4 and unwraps IPv4-mapped IPv6", () => {
    expect(normalizeClientIp("203.0.113.10")).toBe("203.0.113.10");
    expect(normalizeClientIp("::ffff:203.0.113.10")).toBe("203.0.113.10");
  });

  it("groups equivalent IPv6 interface addresses by /64", () => {
    expect(normalizeClientIp("2001:db8:abcd:12::1")).toBe(
      "2001:0db8:abcd:0012::/64",
    );
    expect(normalizeClientIp("2001:0db8:abcd:0012:ffff::99")).toBe(
      "2001:0db8:abcd:0012::/64",
    );
  });

  it("uses a stable non-identifying fallback for invalid input", () => {
    expect(normalizeClientIp(undefined)).toBe("unknown");
    expect(normalizeClientIp("not-an-ip")).toBe("unknown");
  });
});
