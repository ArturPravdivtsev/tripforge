import { Global, Module } from "@nestjs/common";

import { RedisThrottlerStorage } from "./redis-throttler.storage";
import { SecurityRateLimitGuard } from "./security-rate-limit.guard";

@Global()
@Module({
  providers: [RedisThrottlerStorage, SecurityRateLimitGuard],
  exports: [RedisThrottlerStorage, SecurityRateLimitGuard],
})
export class SecurityModule {}
