import { createHash } from "node:crypto";

import {
  Injectable,
  type OnApplicationShutdown,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type {
  ThrottlerStorage,
} from "@nestjs/throttler";
import Redis from "ioredis";

const CONNECT_TIMEOUT_MS = 1_500;
const KEY_PREFIX = "tripforge:security:rate-limit";
const INCREMENT_SCRIPT = `
local count_key = KEYS[1]
local block_key = KEYS[2]
local ttl = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
local block_duration = tonumber(ARGV[3])

local active_block_ttl = redis.call('PTTL', block_key)
if active_block_ttl > 0 then
  local existing = tonumber(redis.call('GET', count_key)) or (limit + 1)
  local existing_ttl = redis.call('PTTL', count_key)
  return {existing, existing_ttl, 1, active_block_ttl}
end

local total = redis.call('INCR', count_key)
if total == 1 then
  redis.call('PEXPIRE', count_key, ttl)
end
local count_ttl = redis.call('PTTL', count_key)

if total > limit then
  redis.call('SET', block_key, '1', 'PX', block_duration, 'NX')
  redis.call('PEXPIRE', count_key, block_duration)
  local new_block_ttl = redis.call('PTTL', block_key)
  return {total, block_duration, 1, new_block_ttl}
end

return {total, count_ttl, 0, 0}
`;

type ThrottlerRecord = {
  isBlocked: boolean;
  timeToBlockExpire: number;
  timeToExpire: number;
  totalHits: number;
};

@Injectable()
export class RedisThrottlerStorage
  implements ThrottlerStorage, OnApplicationShutdown
{
  private readonly redis: Redis;
  private connectionPromise?: Promise<void>;

  constructor(config: ConfigService) {
    this.redis = new Redis(config.getOrThrow<string>("REDIS_URL"), {
      connectTimeout: CONNECT_TIMEOUT_MS,
      enableOfflineQueue: false,
      enableReadyCheck: true,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      retryStrategy: (attempt) => Math.min(attempt * 100, 1_000),
    });
    this.redis.on("error", () => {
      // Callers choose fail-closed behavior; never log URLs or credentials here.
    });
  }

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerRecord> {
    await this.ensureReady();
    const digest = createHash("sha256").update(key).digest("hex");
    const prefix = `${KEY_PREFIX}:${throttlerName}:${digest}`;
    const result = await this.redis.eval(
      INCREMENT_SCRIPT,
      2,
      `${prefix}:count`,
      `${prefix}:block`,
      ttl,
      limit,
      blockDuration,
    );
    if (!Array.isArray(result) || result.length !== 4) {
      throw new Error("Unexpected Redis rate-limit response");
    }
    const [totalHits, timeToExpireMs, isBlocked, timeToBlockExpireMs] =
      result.map(Number);

    return {
      isBlocked: isBlocked === 1,
      timeToBlockExpire: millisecondsToSeconds(timeToBlockExpireMs),
      timeToExpire: millisecondsToSeconds(timeToExpireMs),
      totalHits,
    };
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.redis.status === "ready") {
      await this.redis.quit();
    } else if (this.redis.status !== "end") {
      this.redis.disconnect();
    }
  }

  private async ensureReady(): Promise<void> {
    if (this.redis.status === "ready") return;
    this.connectionPromise ??= this.connect().finally(() => {
      this.connectionPromise = undefined;
    });
    await this.connectionPromise;
  }

  private async connect(): Promise<void> {
    if (this.redis.status === "wait") {
      await this.redis.connect();
      return;
    }
    if (this.redis.status === "end") {
      throw new Error("Redis rate limiter is closed");
    }

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error("Redis rate limiter connection timed out"));
      }, CONNECT_TIMEOUT_MS);
      timeout.unref();
      const cleanup = () => {
        clearTimeout(timeout);
        this.redis.off("ready", onReady);
        this.redis.off("end", onEnd);
      };
      const onReady = () => {
        cleanup();
        resolve();
      };
      const onEnd = () => {
        cleanup();
        reject(new Error("Redis rate limiter connection ended"));
      };
      this.redis.once("ready", onReady);
      this.redis.once("end", onEnd);
    });
  }
}

function millisecondsToSeconds(value: number): number {
  return value > 0 ? Math.ceil(value / 1_000) : 0;
}
