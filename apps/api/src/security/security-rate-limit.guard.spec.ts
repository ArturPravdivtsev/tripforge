import { HttpException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Reflector } from "@nestjs/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RedisThrottlerStorage } from "./redis-throttler.storage";
import { SecurityRateLimitGuard } from "./security-rate-limit.guard";

describe("SecurityRateLimitGuard", () => {
  const increment = vi.fn();
  const logEvent = vi.fn();
  const rateLimitRejected = vi.fn();
  const setHeader = vi.fn();

  beforeEach(() => {
    increment.mockReset().mockResolvedValue({
      isBlocked: false,
      timeToBlockExpire: 0,
      timeToExpire: 300,
      totalHits: 1,
    });
    setHeader.mockReset();
    logEvent.mockReset();
    rateLimitRejected.mockReset();
  });

  it("requires independent IP and normalized-account login buckets", async () => {
    const guard = subject("login");

    await expect(
      guard.canActivate(context({ email: " User@Example.COM " })),
    ).resolves.toBe(true);

    expect(increment).toHaveBeenCalledTimes(2);
    expect(increment.mock.calls[0]?.[0]).toContain("login:ip:203.0.113.10");
    expect(increment.mock.calls[1]?.[0]).toContain(
      "login:account:user@example.com",
    );
  });

  it("returns a safe 429 and coarse Retry-After without naming the bucket", async () => {
    increment.mockResolvedValue({
      isBlocked: true,
      timeToBlockExpire: 42,
      timeToExpire: 100,
      totalHits: 11,
    });
    const guard = subject("login");

    const rejection = guard.canActivate(context({ email: "user@example.com" }));
    await expect(rejection).rejects.toMatchObject({ status: 429 });
    await rejection.catch((error: unknown) => {
      expect((error as HttpException).getResponse()).toEqual({
        code: "TOO_MANY_REQUESTS",
        message: "Too many requests. Please try again later.",
      });
    });
    expect(setHeader).toHaveBeenCalledWith("Retry-After", "42");
    expect(rateLimitRejected).toHaveBeenCalledWith("login.ip");
    expect(JSON.stringify(rateLimitRejected.mock.calls)).not.toMatch(
      /user@example|203\.0\.113/iu,
    );
  });

  it("fails closed with a generic 503 when Redis is unavailable", async () => {
    increment.mockRejectedValue(new Error("redis://secret@internal:6379"));
    const guard = subject("register");

    await expect(guard.canActivate(context({}))).rejects.toMatchObject({
      response: {
        code: "RATE_LIMIT_UNAVAILABLE",
        message: "Service temporarily unavailable",
      },
      status: 503,
    });
  });

  function subject(policy: string): SecurityRateLimitGuard {
    return new SecurityRateLimitGuard(
      { getAllAndOverride: vi.fn(() => policy) } as unknown as Reflector,
      { increment } as unknown as RedisThrottlerStorage,
      new ConfigService({ SECURITY_RATE_LIMITING_ENABLED: true }),
      { event: logEvent } as never,
      { rateLimitRejected } as never,
    );
  }

  function context(body: Record<string, unknown>) {
    return {
      getClass: vi.fn(),
      getHandler: vi.fn(),
      switchToHttp: () => ({
        getRequest: () => ({
          body,
          socket: { remoteAddress: "203.0.113.10" },
        }),
        getResponse: () => ({ setHeader }),
      }),
    } as never;
  }
});
