import type { INestApplicationContext } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { IoAdapter } from "@nestjs/platform-socket.io";
import { createAdapter } from "@socket.io/redis-streams-adapter";
import Redis from "ioredis";
import type { Server, ServerOptions } from "socket.io";

import { AppLogger } from "../observability/app-logger.service";
import { ObservabilityMetrics } from "../observability/metrics.service";
import {
  SOCKET_MAX_HTTP_BUFFER_BYTES,
  SOCKET_PATH,
  SOCKET_STREAM_MAX_LENGTH,
  SOCKET_STREAM_NAME,
} from "./realtime.constants";

export class TripForgeIoAdapter extends IoAdapter {
  private redisClient?: Redis;

  constructor(
    app: INestApplicationContext,
    private readonly configService: ConfigService,
    private readonly logger: AppLogger = new AppLogger(),
    private readonly metrics: ObservabilityMetrics = new ObservabilityMetrics(),
  ) {
    super(app);
  }

  override createIOServer(port: number, options?: ServerOptions): Server {
    const webOrigin = this.configService.getOrThrow<string>("WEB_ORIGIN");
    const server = super.createIOServer(port, {
      ...options,
      allowRequest: (
        request: IncomingMessage,
        callback: (error: string | null | undefined, success: boolean) => void,
      ) => {
        callback(null, isAllowedSocketOrigin(request.headers.origin, webOrigin));
      },
      connectionStateRecovery: undefined,
      cors: {
        credentials: true,
        origin: webOrigin,
      },
      maxHttpBufferSize: SOCKET_MAX_HTTP_BUFFER_BYTES,
      path: SOCKET_PATH,
      serveClient: false,
      transports: ["websocket"],
    }) as Server;

    this.redisClient = new Redis(
      this.configService.getOrThrow<string>("REDIS_URL"),
      {
        enableReadyCheck: true,
        maxRetriesPerRequest: null,
        retryStrategy: (attempt) => Math.min(attempt * 250, 5_000),
      },
    );
    this.redisClient.on("ready", () => {
      this.logger.event("info", "realtime.redis.ready");
    });
    this.redisClient.on("error", () => {
      this.metrics.realtimeEvent("publisher_failure");
      this.logger.event("warn", "realtime.redis.unavailable");
    });
    server.adapter(
      createAdapter(this.redisClient, {
        channelPrefix: SOCKET_STREAM_NAME,
        maxLen: SOCKET_STREAM_MAX_LENGTH,
        onlyPlaintext: true,
        streamName: SOCKET_STREAM_NAME,
      }),
    );

    return server;
  }

  override async close(server: Server): Promise<void> {
    await super.close(server);

    if (this.redisClient?.status !== "end") {
      this.redisClient?.disconnect();
    }
  }
}

export function isAllowedSocketOrigin(
  requestOrigin: string | undefined,
  webOrigin: string,
): boolean {
  return requestOrigin === webOrigin;
}
import type { IncomingMessage } from "node:http";
