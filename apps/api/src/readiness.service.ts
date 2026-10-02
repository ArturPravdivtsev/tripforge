import { Injectable, type OnApplicationShutdown } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Pool } from "pg";

import { createDatabasePoolConfig } from "./database/database-config";

@Injectable()
export class ReadinessService implements OnApplicationShutdown {
  private readonly pool: Pool;
  private probe?: Promise<boolean>;

  constructor(config: ConfigService) {
    this.pool = new Pool({
      ...createDatabasePoolConfig({
        databaseUrl: config.get<string>("DATABASE_URL"),
        host: config.get<string>("DATABASE_HOST"),
        port: config.get<number>("DATABASE_PORT"),
        name: config.get<string>("DATABASE_NAME"),
        user: config.get<string>("DATABASE_USER"),
        password: config.get<string>("DATABASE_PASSWORD"),
        ssl: config.get<boolean>("DATABASE_SSL"),
      }),
      max: 1,
      idleTimeoutMillis: 5_000,
      connectionTimeoutMillis: 500,
      query_timeout: 500,
      statement_timeout: 500,
    });
    this.pool.on("error", () => undefined);
  }

  check(): Promise<boolean> {
    // Share a bounded probe: concurrent ALB/operator checks cannot grow the queue.
    this.probe ??= this.pool.query("SELECT 1")
      .then(() => true, () => false)
      .finally(() => { this.probe = undefined; });
    return this.probe;
  }

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}
