import { describe, expect, it } from "vitest";

import { validateWorkerEnvironment } from "./worker-environment";

describe("validateWorkerEnvironment", () => {
  it("applies local worker defaults without WEB_ORIGIN", () => {
    expect(validateWorkerEnvironment({})).toMatchObject({
      DATABASE_URL:
        "postgresql://tripforge:tripforge@127.0.0.1:5433/tripforge",
      REDIS_URL: "redis://127.0.0.1:6379",
      S3_BUCKET: "tripforge-documents",
    });
  });

  it("requires database and Redis URLs in production", () => {
    expect(() =>
      validateWorkerEnvironment({ NODE_ENV: "production" }),
    ).toThrow(/DATABASE_URL.*REDIS_URL/);
  });

  it("rejects a non-Redis connection URL", () => {
    expect(() =>
      validateWorkerEnvironment({ REDIS_URL: "http://redis:6379" }),
    ).toThrow(/REDIS_URL/);
  });
});
