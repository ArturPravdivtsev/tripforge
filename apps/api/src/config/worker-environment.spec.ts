import { describe, expect, it } from "vitest";

import { validateWorkerEnvironment } from "./worker-environment";

describe("validateWorkerEnvironment", () => {
  it("applies local worker defaults without WEB_ORIGIN", () => {
    expect(validateWorkerEnvironment({})).toMatchObject({
      DATABASE_URL:
        "postgresql://tripforge:tripforge@127.0.0.1:5433/tripforge",
      LOG_LEVEL: "debug",
      OTEL_ENABLED: false,
      REDIS_URL: "redis://127.0.0.1:6379",
      S3_BUCKET: "tripforge-documents",
    });
  });

  it("requires database configuration and Redis URL in production", () => {
    expect(() =>
      validateWorkerEnvironment({
        NODE_ENV: "production",
        REDIS_URL: "rediss://:secret@redis.internal:6379",
      }),
    ).toThrow(/DATABASE_URL.*DATABASE/);
  });

  it("accepts discrete TLS database and Redis configuration", () => {
    expect(
      validateWorkerEnvironment({
        DATABASE_HOST: "database.internal",
        DATABASE_NAME: "tripforge",
        DATABASE_PASSWORD: "secret",
        DATABASE_PORT: "5432",
        DATABASE_SSL: "true",
        DATABASE_USER: "tripforge",
        NODE_ENV: "production",
        REDIS_URL: "rediss://:secret@redis.internal:6379",
      }),
    ).toMatchObject({
      DATABASE_HOST: "database.internal",
      DATABASE_PORT: 5432,
      DATABASE_SSL: true,
    });
  });

  it("rejects plaintext Redis in production", () => {
    expect(() =>
      validateWorkerEnvironment({
        DATABASE_URL: "postgresql://user:password@database:5432/app",
        NODE_ENV: "production",
        REDIS_URL: "redis://redis.internal:6379",
      }),
    ).toThrow(/rediss/);
  });

  it("rejects a non-Redis connection URL", () => {
    expect(() =>
      validateWorkerEnvironment({ REDIS_URL: "http://redis:6379" }),
    ).toThrow(/REDIS_URL/);
  });

  it("validates worker observability values", () => {
    expect(() =>
      validateWorkerEnvironment({ OTEL_TRACES_SAMPLER_ARG: "2" }),
    ).toThrow(/OTEL_TRACES_SAMPLER_ARG/);
  });
});
