import type { Provider } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { createDatabasePoolConfig } from "./database-config";
import { DATABASE, DATABASE_POOL } from "./database.constants";
import * as schema from "./schema";
import { ObservabilityMetrics } from "../observability/metrics.service";

export type Database = NodePgDatabase<typeof schema>;

export const databaseProviders: Provider[] = [
  {
    provide: DATABASE_POOL,
    inject: [ConfigService, ObservabilityMetrics],
    useFactory: (
      configService: ConfigService,
      metrics: ObservabilityMetrics,
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
        }),
      );
      metrics.registerPool(pool);
      return pool;
    },
  },
  {
    provide: DATABASE,
    inject: [DATABASE_POOL],
    useFactory: (pool: Pool): Database => drizzle(pool, { schema }),
  },
];
