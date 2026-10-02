import type { Provider } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { createDatabasePoolConfig } from "./database-config";
import { DATABASE, DATABASE_POOL } from "./database.constants";
import * as schema from "./schema";
import { ObservabilityMetrics } from "../observability/metrics.service";
import { AppLogger } from "../observability/app-logger.service";

export type Database = NodePgDatabase<typeof schema>;
export type DatabaseTransaction = Parameters<
  Parameters<Database["transaction"]>[0]
>[0];

export const databaseProviders: Provider[] = [
  {
    provide: DATABASE_POOL,
    inject: [ConfigService, ObservabilityMetrics, AppLogger],
    useFactory: (
      configService: ConfigService,
      metrics: ObservabilityMetrics,
      logger: AppLogger,
    ): Pool => {
      const pool = new Pool(
        createDatabasePoolConfig({
          databaseUrl: configService.get<string>("DATABASE_URL"),
          host: configService.get<string>("DATABASE_HOST"),
          port: configService.get<number>("DATABASE_PORT"),
          name: configService.get<string>("DATABASE_NAME"),
          user: configService.get<string>("DATABASE_USER"),
          password: configService.get<string>("DATABASE_PASSWORD"),
          ssl: configService.get<boolean>("DATABASE_SSL"),
          poolMax: configService.get<number>("DATABASE_POOL_MAX"),
          idleTimeoutMs: configService.get<number>("DATABASE_POOL_IDLE_TIMEOUT_MS"),
          connectionTimeoutMs: configService.get<number>("DATABASE_POOL_CONNECTION_TIMEOUT_MS"),
        }),
      );
      metrics.registerPool(pool);
      pool.on("error", () => logger.event("error", "database.pool.error", { errorType: "DatabaseConnectionError" }));
      return pool;
    },
  },
  {
    provide: DATABASE,
    inject: [DATABASE_POOL],
    useFactory: (pool: Pool): Database => drizzle(pool, { schema }),
  },
];
