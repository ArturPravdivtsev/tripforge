import { Writable } from "node:stream";

import { afterEach, describe, expect, it } from "vitest";

import { AppLogger, sanitizeLogFields } from "./app-logger.service";
import { requestContext } from "./request-context";

const originalEnvironment = process.env.NODE_ENV;
const originalLogLevel = process.env.LOG_LEVEL;

describe("AppLogger", () => {
  afterEach(() => {
    restore("NODE_ENV", originalEnvironment);
    restore("LOG_LEVEL", originalLogLevel);
  });

  it("emits one production JSON object with request correlation", () => {
    process.env.NODE_ENV = "production";
    process.env.LOG_LEVEL = "info";
    const lines: string[] = [];
    const destination = new Writable({
      write(chunk, _encoding, callback) {
        lines.push(String(chunk));
        callback();
      },
    });
    const logger = new AppLogger(destination);

    requestContext.run(
      { requestId: "10000000-0000-4000-8000-000000000001" },
      () =>
        logger.event("info", "http.request.completed", {
          durationMs: 12.5,
          route: "/api/trips/:tripId/search",
        }),
    );

    const record = JSON.parse(lines.join("")) as Record<string, unknown>;
    expect(record).toMatchObject({
      event: "http.request.completed",
      level: "info",
      requestId: "10000000-0000-4000-8000-000000000001",
      route: "/api/trips/:tripId/search",
      service: "tripforge-api",
    });
  });

  it("redacts sensitive keys recursively without serializing errors", () => {
    expect(
      sanitizeLogFields({
        nested: { authorization: "Bearer secret", password: "secret" },
        presignedUrl: "https://storage.example/signed",
        safe: "value",
        token: "opaque",
      }),
    ).toEqual({
      nested: { authorization: "[Redacted]", password: "[Redacted]" },
      presignedUrl: "[Redacted]",
      safe: "value",
      token: "[Redacted]",
    });
  });
});

function restore(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
