import { describe, expect, it } from "vitest";

import { validateEnvironment } from "./environment";

describe("validateEnvironment", () => {
  it("accepts and converts a valid TCP port", () => {
    const environment = validateEnvironment({
      NODE_ENV: "test",
      PORT: "4100",
    });

    expect(environment).toMatchObject({ NODE_ENV: "test", PORT: 4100 });
  });

  it("applies development defaults", () => {
    expect(validateEnvironment({})).toMatchObject({
      NODE_ENV: "development",
      PORT: 4000,
    });
  });

  it("rejects an invalid TCP port", () => {
    expect(() =>
      validateEnvironment({ NODE_ENV: "test", PORT: "not-a-port" }),
    ).toThrow(/PORT/);
  });

  it("rejects an unsupported Node environment", () => {
    expect(() =>
      validateEnvironment({ NODE_ENV: "staging", PORT: 4000 }),
    ).toThrow(/NODE_ENV/);
  });
});
