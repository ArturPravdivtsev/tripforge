import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const MIGRATIONS = [
  "0000_ancient_vector.sql",
  "0001_secret_the_spike.sql",
  "0002_cute_ma_gnuci.sql",
] as const;
const STAGE_12_MIGRATION = "0003_material_purple_man.sql";

async function applySqlMigration(pool: Pool, filename: string) {
  const sql = await readFile(resolve(process.cwd(), "drizzle", filename), "utf8");

  for (const statement of sql.split("--> statement-breakpoint")) {
    if (statement.trim()) await pool.query(statement);
  }
}

describe("Stage 12 migration backfill", () => {
  let container: StartedPostgreSqlContainer;
  let pool: Pool;

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:18.6-bookworm")
      .withDatabase("tripforge")
      .withUsername("tripforge")
      .withPassword("tripforge")
      .start();
    pool = new Pool({ connectionString: container.getConnectionUri() });

    for (const migration of MIGRATIONS) await applySqlMigration(pool, migration);
  });

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  it("backfills inclusive Days without touching Trip timestamps", async () => {
    const user = await pool.query<{ id: string }>(
      "INSERT INTO users (email) VALUES ('migration@example.com') RETURNING id",
    );
    const timestamp = "2026-01-02T03:04:05.000Z";
    const dated = await pool.query<{ id: string }>(
      `INSERT INTO trips (owner_id, name, starts_on, ends_on, created_at, updated_at)
       VALUES ($1, 'Existing dated Trip', '2027-04-12', '2027-04-14', $2, $2)
       RETURNING id`,
      [user.rows[0]!.id, timestamp],
    );
    const partial = await pool.query<{ id: string }>(
      `INSERT INTO trips (owner_id, name, starts_on)
       VALUES ($1, 'Existing partial Trip', '2027-04-12')
       RETURNING id`,
      [user.rows[0]!.id],
    );

    await applySqlMigration(pool, STAGE_12_MIGRATION);

    const days = await pool.query<{ date: string }>(
      "SELECT date::text FROM trip_days WHERE trip_id = $1 ORDER BY date",
      [dated.rows[0]!.id],
    );
    const partialDays = await pool.query<{ total: number }>(
      "SELECT count(*)::int AS total FROM trip_days WHERE trip_id = $1",
      [partial.rows[0]!.id],
    );
    const persisted = await pool.query<{
      created_at: Date;
      updated_at: Date;
    }>("SELECT created_at, updated_at FROM trips WHERE id = $1", [
      dated.rows[0]!.id,
    ]);

    expect(days.rows.map(({ date }) => date)).toEqual([
      "2027-04-12",
      "2027-04-13",
      "2027-04-14",
    ]);
    expect(partialDays.rows[0]?.total).toBe(0);
    expect(persisted.rows[0]?.created_at.toISOString()).toBe(timestamp);
    expect(persisted.rows[0]?.updated_at.toISOString()).toBe(timestamp);
  });
});
