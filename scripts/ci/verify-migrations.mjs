import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const apiRoot = join(root, "apps", "api");
const require = createRequire(join(apiRoot, "package.json"));
const { Client } = require("pg");
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) throw new Error("DATABASE_URL is required");

const journalPath = join(apiRoot, "drizzle", "meta", "_journal.json");
const journal = JSON.parse(await readFile(journalPath, "utf8"));
const expectedHashes = [];

for (const entry of journal.entries) {
  const sql = await readFile(join(dirname(journalPath), "..", `${entry.tag}.sql`));
  expectedHashes.push(createHash("sha256").update(sql).digest("hex"));
}

const client = new Client({ connectionString: databaseUrl });
await client.connect();

try {
  const migrations = await client.query(
    'select hash from drizzle.__drizzle_migrations order by created_at asc',
  );
  const extension = await client.query(
    "select extname from pg_extension where extname = 'pg_trgm'",
  );
  const actualHashes = migrations.rows.map(({ hash }) => hash);

  if (actualHashes.length !== journal.entries.length) {
    throw new Error(
      `Expected ${journal.entries.length} migrations, found ${actualHashes.length}`,
    );
  }
  if (new Set(actualHashes).size !== actualHashes.length) {
    throw new Error("Migration journal contains duplicate hashes");
  }
  if (expectedHashes.some((hash) => !actualHashes.includes(hash))) {
    throw new Error("Database migration hashes differ from repository SQL files");
  }
  if (extension.rowCount !== 1) {
    throw new Error("pg_trgm extension is missing");
  }

  console.log(
    `Verified ${actualHashes.length} unique migrations and pg_trgm on a fresh database.`,
  );
} finally {
  await client.end();
}
