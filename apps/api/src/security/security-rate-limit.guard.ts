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
import { AppLogger } from "../observability/app-logger.service";
import { ObservabilityMetrics } from "../observability/metrics.service";
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
  private readonly lastRejectionLog = new Map<string, number>();

  constructor(
    private readonly reflector: Reflector,
    private readonly storage: RedisThrottlerStorage,
    config: ConfigService,
    private readonly logger: AppLogger = new AppLogger(),
    private readonly metrics: ObservabilityMetrics = new ObservabilityMetrics(),
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
          const limiter = limiterCategory(policyName, policy.tracker);
          this.metrics.rateLimitRejected(limiter);
          this.logRejection(limiter);
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

  private logRejection(limiter: string): void {
    const now = Date.now();
    const previous = this.lastRejectionLog.get(limiter) ?? 0;
    if (now - previous < 60_000) return;
    this.lastRejectionLog.set(limiter, now);
    this.logger.event("warn", "security.rate_limit.rejected", { limiter });
  }
}

export function limiterCategory(
  policy: SecurityRateLimitPolicyName,
  tracker: "account" | "ip" | "user",
): string {
  const names: Record<SecurityRateLimitPolicyName, string> = {
    aiConversationCreate: "ai_conversation_create",
    aiTurn: "ai_turn",
    documentDownload: "document_download",
    documentUpload: "document_upload",
    login: "login",
    register: "register",
    routeCalculation: "routing",
    tripSearch: "search",
  };
  return `${names[policy]}.${tracker}`;
}
