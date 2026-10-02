import { join } from "node:path";

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

import {
  createDatabasePoolConfig,
  databaseConfigurationFromEnvironment,
} from "./database/database-config";

async function main() {
  const pool = new Pool(
    createDatabasePoolConfig(databaseConfigurationFromEnvironment(process.env)),
  );

  try {
    await migrate(drizzle(pool), {
      migrationsFolder: join(__dirname, "..", "drizzle"),
    });
    console.log("Database migrations applied successfully.");
  } finally {
    await pool.end();
  }
}

void main();
