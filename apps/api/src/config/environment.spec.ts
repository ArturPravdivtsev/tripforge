import { describe, expect, it } from "vitest";

import { validateEnvironment } from "./environment";

describe("validateEnvironment", () => {
  it("accepts and converts a valid TCP port", () => {
    const environment = validateEnvironment({
      DATABASE_URL: "postgresql://user:password@database:5432/app",
      NODE_ENV: "test",
      PORT: "4100",
    });

    expect(environment).toMatchObject({
      DATABASE_URL: "postgresql://user:password@database:5432/app",
      NODE_ENV: "test",
      PORT: 4100,
    });
  });

  it("applies development defaults", () => {
    expect(validateEnvironment({})).toMatchObject({
      DATABASE_URL:
        "postgresql://tripforge:tripforge@127.0.0.1:5433/tripforge",
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

  it("rejects an invalid database URL", () => {
    expect(() =>
      validateEnvironment({ DATABASE_URL: "not-a-url", NODE_ENV: "test" }),
    ).toThrow(/DATABASE_URL/);
  });

  it("requires a database URL in production", () => {
    expect(() => validateEnvironment({ NODE_ENV: "production" })).toThrow(
      /DATABASE_URL/,
    );
  });
});
