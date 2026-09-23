import Redis from "ioredis";

async function check(): Promise<void> {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) throw new Error("REDIS_URL is required");
  const redis = new Redis(redisUrl, {
    connectTimeout: 2_000,
    lazyConnect: true,
    maxRetriesPerRequest: 1,
  });
  try {
    await redis.connect();
    const response = await redis.ping();
    if (response !== "PONG") throw new Error("Redis did not return PONG");
  } finally {
    if (redis.status !== "end") await redis.quit();
  }
}

void check().catch(() => {
  process.exitCode = 1;
});
