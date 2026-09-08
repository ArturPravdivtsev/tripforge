import type { Provider } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { DATABASE, DATABASE_POOL } from "./database.constants";
import * as schema from "./schema";

export type Database = NodePgDatabase<typeof schema>;

export const databaseProviders: Provider[] = [
  {
    provide: DATABASE_POOL,
    inject: [ConfigService],
    useFactory: (configService: ConfigService): Pool =>
      new Pool({
        connectionString: configService.getOrThrow<string>("DATABASE_URL"),
      }),
  },
  {
    provide: DATABASE,
    inject: [DATABASE_POOL],
    useFactory: (pool: Pool): Database => drizzle(pool, { schema }),
  },
];
