import { Writable } from "node:stream";

import { type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AppModule } from "../src/app.module";
import { configureApplication } from "../src/common/configure-application";
import {
  APP_LOG_DESTINATION,
  AppLogger,
} from "../src/observability/app-logger.service";

describe("API observability boundary", () => {
  let app: INestApplication;
  const lines: string[] = [];
  const requestId = "10000000-0000-4000-8000-000000000001";
  const previousEnvironment = process.env.NODE_ENV;

  beforeAll(async () => {
    process.env.NODE_ENV = "test";
    const destination = new Writable({
      write(chunk, _encoding, callback) {
        lines.push(String(chunk));
        callback();
      },
    });
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(APP_LOG_DESTINATION)
      .useValue(destination)
      .compile();
    app = module.createNestApplication({ bufferLogs: true });
    app.useLogger(app.get(AppLogger));
    configureApplication(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    if (previousEnvironment === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousEnvironment;
  });

  it("returns a validated request ID and writes its safe completion log", async () => {
    const response = await request(app.getHttpServer())
      .get("/health")
      .set("X-Request-ID", requestId);

    expect(response.status).toBe(200);
    expect(response.headers["x-request-id"]).toBe(requestId);
    expect(records()).toContainEqual(
      expect.objectContaining({
        event: "http.request.completed",
        requestId,
        route: "/health",
        statusCode: 200,
      }),
    );
  });

  it("replaces an unsafe request ID and never logs a raw search query", async () => {
    const response = await request(app.getHttpServer())
      .get(
        "/api/trips/10000000-0000-4000-8000-000000000001/search?q=my-secret-trip-plan",
      )
      .set("X-Request-ID", "not-a-uuid");

    expect(response.status).toBe(401);
    expect(response.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/u);
    expect(lines.join("")).not.toContain("my-secret-trip-plan");
    expect(records()).toContainEqual(
      expect.objectContaining({
        event: "http.request.completed",
        route: "/api/trips/:tripId/search",
        statusCode: 401,
      }),
    );
  });

  function records(): Array<Record<string, unknown>> {
    return lines
      .join("")
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as Record<string, unknown>);
  }
});
