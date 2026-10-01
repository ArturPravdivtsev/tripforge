import {
  Body,
  ConflictException,
  Controller,
  Get,
  type INestApplication,
  Module,
  Post,
} from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { IsString } from "class-validator";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { AppModule } from "../src/app.module";
import { configureApplication } from "../src/common/configure-application";
import { AppLogger } from "../src/observability/app-logger.service";

class TestInputDto {
  @IsString()
  name!: string;
}

@Controller("test-foundation")
class TestFoundationController {
  @Post("input")
  validateInput(@Body() input: TestInputDto): TestInputDto {
    return input;
  }

  @Get("known-error")
  throwKnownError(): never {
    throw new ConflictException("Safe conflict");
  }

  @Get("unexpected-error")
  throwUnexpectedError(): never {
    throw new Error("Internal implementation detail");
  }
}

@Module({
  imports: [AppModule],
  controllers: [TestFoundationController],
})
class TestApplicationModule {}

describe("Application HTTP foundation", () => {
  let app: INestApplication;
  const loggerEventSpy = vi.spyOn(AppLogger.prototype, "event");

  beforeAll(async () => {
    const testingModule = await Test.createTestingModule({
      imports: [TestApplicationModule],
    }).compile();

    app = testingModule.createNestApplication();
    configureApplication(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    loggerEventSpy.mockRestore();
  });

  it("normalizes unknown API routes", async () => {
    const response = await request(app.getHttpServer()).get(
      "/api/does-not-exist",
    );

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({
      statusCode: 404,
      code: "NOT_FOUND",
      path: "/api/does-not-exist",
      timestamp: expect.any(String),
    });
  });

  it("applies the API prefix and accepts valid input", async () => {
    const unprefixedResponse = await request(app.getHttpServer())
      .post("/test-foundation/input")
      .send({ name: "Japan" });
    const prefixedResponse = await request(app.getHttpServer())
      .post("/api/test-foundation/input")
      .send({ name: "Japan" });

    expect(unprefixedResponse.status).toBe(404);
    expect(prefixedResponse.status).toBe(201);
    expect(prefixedResponse.body).toEqual({ name: "Japan" });
  });

  it("normalizes DTO validation failures", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/test-foundation/input")
      .send({ name: 42 });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      statusCode: 400,
      code: "VALIDATION_ERROR",
      message: "Validation failed",
      path: "/api/test-foundation/input",
      errors: expect.arrayContaining(["name must be a string"]),
    });
  });

  it("returns stable errors for oversized and malformed JSON", async () => {
    const oversized = await request(app.getHttpServer())
      .post("/api/test-foundation/input")
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ name: "x".repeat(300 * 1024) }));
    const malformed = await request(app.getHttpServer())
      .post("/api/test-foundation/input")
      .set("Content-Type", "application/json")
      .send('{"name":');

    expect(oversized.status).toBe(413);
    expect(oversized.body.code).toBe("PAYLOAD_TOO_LARGE");
    expect(malformed.status).toBe(400);
    expect(malformed.body.code).toBe("INVALID_JSON");
  });

  it("rejects TRACE without reflecting request data", async () => {
    const response = await request(app.getHttpServer())
      .trace("/api/test-foundation/input")
      .send("secret-echo-value");

    expect(response.status).toBe(405);
    expect(response.text).not.toContain("secret-echo-value");
    expect(response.body.code).toBe("METHOD_NOT_ALLOWED");
  });

  it("rejects properties outside the DTO whitelist", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/test-foundation/input")
      .send({ name: "Japan", unexpected: true });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      code: "VALIDATION_ERROR",
      errors: expect.arrayContaining([
        "property unexpected should not exist",
      ]),
    });
  });

  it("normalizes known Nest HTTP exceptions", async () => {
    const response = await request(app.getHttpServer()).get(
      "/api/test-foundation/known-error",
    );

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      statusCode: 409,
      code: "CONFLICT",
      message: "Safe conflict",
      path: "/api/test-foundation/known-error",
      timestamp: expect.any(String),
    });
  });

  it("hides details from unexpected exceptions", async () => {
    const response = await request(app.getHttpServer()).get(
      "/api/test-foundation/unexpected-error",
    );
    const serializedBody = JSON.stringify(response.body);

    expect(response.status).toBe(500);
    expect(response.body).toMatchObject({
      statusCode: 500,
      code: "INTERNAL_SERVER_ERROR",
      message: "Internal server error",
      path: "/api/test-foundation/unexpected-error",
      timestamp: expect.any(String),
    });
    expect(serializedBody).not.toContain("Internal implementation detail");
    expect(serializedBody).not.toContain("stack");
    expect(loggerEventSpy).toHaveBeenCalledWith(
      "error",
      "http.request.failed",
      expect.objectContaining({
        errorCode: "INTERNAL_SERVER_ERROR",
        errorType: "Error",
      }),
    );
  });
});
