import {
  type CanActivate,
  type ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";

import type { AuthenticatedUser } from "../auth/auth.types";
import { normalizeEmail } from "../auth/email-normalizer";
import { normalizeClientIp } from "./ip-normalizer";
import { RedisThrottlerStorage } from "./redis-throttler.storage";
import {
  SECURITY_RATE_LIMIT_POLICY,
  SECURITY_RATE_LIMITS,
  type SecurityRateLimitPolicyName,
} from "./security-rate-limit.constants";

type RateLimitRequest = {
  authenticatedUser?: AuthenticatedUser;
  body?: { email?: unknown };
  socket?: { remoteAddress?: string };
};

type RateLimitResponse = {
  setHeader(name: string, value: string): void;
};

@Injectable()
export class SecurityRateLimitGuard implements CanActivate {
  private readonly enabled: boolean;

  constructor(
    private readonly reflector: Reflector,
    private readonly storage: RedisThrottlerStorage,
    config: ConfigService,
  ) {
    this.enabled = config.get<boolean>("SECURITY_RATE_LIMITING_ENABLED") ?? true;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const policyName = this.reflector.getAllAndOverride<
      SecurityRateLimitPolicyName
    >(SECURITY_RATE_LIMIT_POLICY, [context.getHandler(), context.getClass()]);
    if (!this.enabled || !policyName) return true;

    const request = context.switchToHttp().getRequest<RateLimitRequest>();
    const response = context.switchToHttp().getResponse<RateLimitResponse>();

    try {
      for (const policy of SECURITY_RATE_LIMITS[policyName]) {
        const tracker = this.tracker(request, policy.tracker);
        const result = await this.storage.increment(
          `${policyName}:${policy.tracker}:${tracker}`,
          policy.windowMs,
          policy.limit,
          policy.blockDurationMs,
          `${policyName}-${policy.tracker}`,
        );
        if (result.isBlocked) {
          response.setHeader(
            "Retry-After",
            String(Math.max(result.timeToBlockExpire, 1)),
          );
          throw new HttpException(
            {
              code: "TOO_MANY_REQUESTS",
              message: "Too many requests. Please try again later.",
            },
            HttpStatus.TOO_MANY_REQUESTS,
          );
        }
      }
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        {
          code: "RATE_LIMIT_UNAVAILABLE",
          message: "Service temporarily unavailable",
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    return true;
  }

  private tracker(
    request: RateLimitRequest,
    type: "account" | "ip" | "user",
  ): string {
    if (type === "user") {
      return request.authenticatedUser?.id ?? this.ipTracker(request);
    }
    if (type === "account") {
      const email = request.body?.email;
      return typeof email === "string" && email.trim()
        ? normalizeEmail(email)
        : "invalid-account-input";
    }
    return this.ipTracker(request);
  }

  private ipTracker(request: RateLimitRequest): string {
    return normalizeClientIp(request.socket?.remoteAddress);
  }
}
