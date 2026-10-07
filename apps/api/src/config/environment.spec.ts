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
      WEB_ORIGIN: "http://127.0.0.1:3000",
    });
  });

  it("applies development defaults", () => {
    expect(validateEnvironment({})).toMatchObject({
      DATABASE_URL:
        "postgresql://tripforge:tripforge@127.0.0.1:5433/tripforge",
      NODE_ENV: "development",
      LOG_LEVEL: "debug",
      AI_ASSISTANT_ENABLED: false,
      OPENAI_MAX_OUTPUT_TOKENS: 1500,
      OPENAI_MODEL: "gpt-6-luna",
      OPENAI_REASONING_EFFORT: "medium",
      OPENAI_TIMEOUT_MS: 45000,
      OTEL_ENABLED: false,
      PORT: 4000,
      S3_BUCKET: "tripforge-documents",
      S3_FORCE_PATH_STYLE: false,
      S3_REGION: "us-east-1",
      SECURITY_RATE_LIMITING_ENABLED: true,
      WEB_ORIGIN: "http://127.0.0.1:3000",
    });
  });

  it("allows routing to remain unconfigured", () => {
    expect(validateEnvironment({ OPENROUTESERVICE_API_KEY: "" }))
      .not.toHaveProperty("OPENROUTESERVICE_API_KEY");
  });

  it("validates AI model controls without requiring a key", () => {
    expect(validateEnvironment({ AI_ASSISTANT_ENABLED: "true" })).toMatchObject({
      AI_ASSISTANT_ENABLED: true,
      OPENAI_MODEL: "gpt-6-luna",
      OPENAI_REASONING_EFFORT: "medium",
    });
    expect(() => validateEnvironment({ OPENAI_REASONING_EFFORT: "extreme" })).toThrow(
      /OPENAI_REASONING_EFFORT/,
    );
    expect(() => validateEnvironment({ OPENAI_TIMEOUT_MS: 1000 })).toThrow(
      /OPENAI_TIMEOUT_MS/,
    );
    expect(() => validateEnvironment({ OPENAI_MAX_OUTPUT_TOKENS: 10_000 })).toThrow(
      /OPENAI_MAX_OUTPUT_TOKENS/,
    );
  });

  it("accepts separate internal and public S3 endpoints", () => {
    expect(
      validateEnvironment({
        S3_ENDPOINT: "http://localstack:4566",
        S3_FORCE_PATH_STYLE: "true",
        S3_PUBLIC_ENDPOINT: "http://localhost:4566",
      }),
    ).toMatchObject({
      S3_ENDPOINT: "http://localstack:4566",
      S3_FORCE_PATH_STYLE: true,
      S3_PUBLIC_ENDPOINT: "http://localhost:4566",
    });
  });

  it("rejects malformed S3 endpoints", () => {
    expect(() => validateEnvironment({ S3_ENDPOINT: "localstack:4566" })).toThrow(
      /S3_ENDPOINT/,
    );
  });

  it("accepts a path-prefixed S3-compatible endpoint and the hosted region", () => {
    const endpoint = "https://escgigaitmycmhkcsjny.storage.supabase.co/storage/v1/s3";
    const environment = validateEnvironment({
      S3_BUCKET: "tripforge-demo-documents",
      S3_ENDPOINT: endpoint,
      S3_FORCE_PATH_STYLE: "true",
      S3_REGION: "eu-west-2",
    });
    expect(environment).toMatchObject({
      S3_BUCKET: "tripforge-demo-documents", S3_ENDPOINT: endpoint,
      S3_FORCE_PATH_STYLE: true, S3_REGION: "eu-west-2",
    });
    expect(environment).not.toHaveProperty("S3_PUBLIC_ENDPOINT");
  });

  it.each(["S3_ENDPOINT", "S3_PUBLIC_ENDPOINT"])("rejects malformed %s configurations", name => {
    for (const endpoint of ["not a URL", "ftp://storage.example.test", "https://", "https://bad host/storage/v1/s3"]) {
      expect(() => validateEnvironment({ [name]: endpoint })).toThrow(new RegExp(name));
    }
    expect(() => validateEnvironment({ S3_FORCE_PATH_STYLE: "sometimes" }))
      .toThrow(/S3_FORCE_PATH_STYLE/u);
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

  it("requires a complete database configuration in production", () => {
    expect(() =>
      validateEnvironment({
        NODE_ENV: "production",
        REDIS_URL: "rediss://:secret@redis.internal:6379",
        WEB_ORIGIN: "https://app.example.com",
      }),
    ).toThrow(/DATABASE_URL.*DATABASE/);
  });

  it("accepts discrete TLS database configuration in production", () => {
    expect(
      validateEnvironment({
        DATABASE_HOST: "database.internal",
        DATABASE_NAME: "tripforge",
        DATABASE_PASSWORD: "secret",
        DATABASE_PORT: "5432",
        DATABASE_SSL: "true",
        DATABASE_USER: "tripforge",
        NODE_ENV: "production",
        REDIS_URL: "rediss://:secret@redis.internal:6379",
        WEB_ORIGIN: "https://app.example.com",
      }),
    ).toMatchObject({
      DATABASE_HOST: "database.internal",
      DATABASE_PORT: 5432,
      DATABASE_SSL: true,
    });
  });

  it("rejects ambiguous production database configuration", () => {
    expect(() =>
      validateEnvironment({
        DATABASE_HOST: "database.internal",
        DATABASE_URL: "postgresql://user:password@database:5432/app",
        NODE_ENV: "production",
        REDIS_URL: "rediss://:secret@redis.internal:6379",
        WEB_ORIGIN: "https://app.example.com",
      }),
    ).toThrow(/cannot be combined/);
  });

  it("requires encrypted Redis transport in production", () => {
    expect(() =>
      validateEnvironment({
        DATABASE_URL: "postgresql://user:password@database:5432/app",
        NODE_ENV: "production",
        REDIS_URL: "redis://redis.internal:6379",
        WEB_ORIGIN: "https://app.example.com",
      }),
    ).toThrow(/rediss/);
  });

  it.each([
    "http://example.com/path",
    "http://example.com?query=1",
    "http://example.com/#fragment",
    "ftp://example.com",
  ])("rejects a WEB_ORIGIN that is not an exact HTTP origin: %s", (origin) => {
    expect(() =>
      validateEnvironment({ NODE_ENV: "test", WEB_ORIGIN: origin }),
    ).toThrow(/WEB_ORIGIN/);
  });

  it("requires WEB_ORIGIN in production", () => {
    expect(() =>
      validateEnvironment({
        DATABASE_URL: "postgresql://user:password@database:5432/app",
        NODE_ENV: "production",
        REDIS_URL: "rediss://:secret@redis.internal:6379",
      }),
    ).toThrow(/WEB_ORIGIN/);
  });

  it("disables distributed rate limiting by default only in tests", () => {
    expect(
      validateEnvironment({ NODE_ENV: "test" }),
    ).toHaveProperty("SECURITY_RATE_LIMITING_ENABLED", false);
  });

  it("does not allow production rate limiting to be disabled", () => {
    expect(() =>
      validateEnvironment({
        DATABASE_URL: "postgresql://user:password@database:5432/app",
        NODE_ENV: "production",
        REDIS_URL: "rediss://:secret@redis.internal:6379",
        SECURITY_RATE_LIMITING_ENABLED: "false",
        WEB_ORIGIN: "https://tripforge.example",
      }),
    ).toThrow(/SECURITY_RATE_LIMITING_ENABLED/);
  });

  it("validates observability configuration and keeps tests disabled", () => {
    expect(validateEnvironment({ NODE_ENV: "test" })).toMatchObject({
      LOG_LEVEL: "info",
      OTEL_ENABLED: false,
      OTEL_TRACES_SAMPLER: "parentbased_traceidratio",
      OTEL_TRACES_SAMPLER_ARG: 1,
    });
    expect(() =>
      validateEnvironment({ LOG_LEVEL: "everything", NODE_ENV: "test" }),
    ).toThrow(/LOG_LEVEL/);
    expect(() =>
      validateEnvironment({
        NODE_ENV: "test",
        OTEL_EXPORTER_OTLP_ENDPOINT: "redis://collector",
      }),
    ).toThrow(/OTEL_EXPORTER_OTLP_ENDPOINT/);
  });
});
