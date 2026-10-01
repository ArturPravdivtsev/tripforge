import { SetMetadata } from "@nestjs/common";

import {
  SECURITY_RATE_LIMIT_POLICY,
  type SecurityRateLimitPolicyName,
} from "./security-rate-limit.constants";

export const SecurityRateLimit = (policy: SecurityRateLimitPolicyName) =>
  SetMetadata(SECURITY_RATE_LIMIT_POLICY, policy);
