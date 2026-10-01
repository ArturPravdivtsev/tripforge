import { join } from "node:path";

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL?.trim();

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

async function main() {
  const pool = new Pool({ connectionString: databaseUrl });

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
