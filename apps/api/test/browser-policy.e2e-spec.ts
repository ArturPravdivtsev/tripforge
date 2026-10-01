import {
  Body,
  Controller,
  Get,
  Module,
  Post,
  UseGuards,
  type INestApplication,
} from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { BrowserMutationGuard } from "../src/auth/browser/browser-mutation.guard";
import { RequireJsonBody } from "../src/auth/browser/require-json-body.decorator";
import { RegisterDto } from "../src/auth/dto/register.dto";
import { configureApplication } from "../src/common/configure-application";

const WEB_ORIGIN = "http://127.0.0.1:3000";

@Controller("auth")
@UseGuards(BrowserMutationGuard)
class BrowserPolicyController {
  @Post("register")
  @RequireJsonBody()
  register(@Body() body: RegisterDto) {
    return body;
  }

  @Post("logout")
  logout() {
    return undefined;
  }

  @Get("me")
  me() {
    return { user: null };
  }
}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [() => ({ WEB_ORIGIN })],
    }),
  ],
  controllers: [BrowserPolicyController],
  providers: [BrowserMutationGuard],
})
class BrowserPolicyModule {}

describe("browser mutation and CORS policy", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const testingModule = await Test.createTestingModule({
      imports: [BrowserPolicyModule],
    }).compile();

    app = testingModule.createNestApplication();
    configureApplication(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("allows a trusted JSON mutation with the browser marker", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/auth/register")
      .set("Origin", WEB_ORIGIN)
      .set("X-TripForge-Request", "1")
      .send({ email: "user@example.com", password: "long-enough-password" });

    expect(response.status).toBe(201);
  });

  it.each([
    ["missing browser marker", WEB_ORIGIN, undefined],
    ["wrong origin", "http://evil.example", "1"],
  ])("rejects %s", async (_name, origin, marker) => {
    const pendingRequest = request(app.getHttpServer())
      .post("/api/auth/logout")
      .set("Origin", origin);

    if (marker) {
      pendingRequest.set("X-TripForge-Request", marker);
    }

    const response = await pendingRequest;

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      code: "CSRF_PROTECTION_FAILED",
      message: "Browser request rejected",
    });
  });

  it("rejects cross-site Fetch Metadata with otherwise trusted headers", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/auth/logout")
      .set("Origin", WEB_ORIGIN)
      .set("Sec-Fetch-Site", "cross-site")
      .set("X-TripForge-Request", "1");

    expect(response.status).toBe(403);
    expect(response.body.code).toBe("CSRF_PROTECTION_FAILED");
  });

  it("rejects a non-JSON credential request", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/auth/register")
      .set("Origin", WEB_ORIGIN)
      .set("X-TripForge-Request", "1")
      .type("form")
      .send({ email: "user@example.com", password: "long-enough-password" });

    expect(response.status).toBe(415);
    expect(response.body.code).toBe("UNSUPPORTED_MEDIA_TYPE");
  });

  it.each([
    ["__proto__", '{"__proto__":{"polluted":true}}'],
    ["constructor", '{"constructor":{"prototype":{"polluted":true}}}'],
    ["nested prototype", '{"displayName":{"prototype":{"polluted":true}}}'],
  ])("rejects prototype-pollution key %s before application logic", async (_name, attack) => {
    const response = await request(app.getHttpServer())
      .post("/api/auth/register")
      .set("Content-Type", "application/json")
      .set("Origin", WEB_ORIGIN)
      .set("X-TripForge-Request", "1")
      .send(
        `{"email":"user@example.com","password":"long-enough-password",${attack.slice(1)}`,
      );

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("VALIDATION_ERROR");
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
  });

  it("does not require mutation headers for safe requests", async () => {
    const response = await request(app.getHttpServer()).get("/api/auth/me");

    expect(response.status).toBe(200);
  });

  it("returns credentialed CORS headers for the exact web origin", async () => {
    const response = await request(app.getHttpServer())
      .options("/api/auth/register")
      .set("Origin", WEB_ORIGIN)
      .set("Access-Control-Request-Method", "POST")
      .set(
        "Access-Control-Request-Headers",
        "Content-Type, X-TripForge-Request",
      );

    expect(response.status).toBe(204);
    expect(response.headers["access-control-allow-origin"]).toBe(WEB_ORIGIN);
    expect(response.headers["access-control-allow-credentials"]).toBe("true");
    expect(response.headers["access-control-allow-methods"]).toBe(
      "GET,POST,PATCH,DELETE,OPTIONS",
    );
  });

  it("does not authorize an untrusted preflight origin", async () => {
    const response = await request(app.getHttpServer())
      .options("/api/auth/register")
      .set("Origin", "http://evil.example")
      .set("Access-Control-Request-Method", "POST");

    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
  });
});
