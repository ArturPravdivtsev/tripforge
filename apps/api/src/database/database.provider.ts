import type { Provider } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

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
      const pool = new Pool({
        connectionString: configService.getOrThrow<string>("DATABASE_URL"),
      });
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
