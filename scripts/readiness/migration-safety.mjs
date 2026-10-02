import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { destructiveStatements } from "./safety.mjs";
import { root } from "./stack.mjs";

const directory = join(root, "apps/api/drizzle");
const approvals = JSON.parse(await readFile(join(root, "scripts/readiness/migration-approvals.json"), "utf8"));
let failures = 0;
for (const filename of (await readdir(directory)).filter((name) => name.endsWith(".sql"))) {
  const sql = await readFile(join(directory, filename), "utf8");
  const statements = destructiveStatements(sql);
  if (!statements.length) continue;
  const approval = approvals[filename];
  const hash = createHash("sha256").update(sql).digest("hex");
  if (approval?.sha256 !== hash || !["reason", "compatibility", "recovery", "reviewer"].every((field) => typeof approval?.[field] === "string" && approval[field].trim().length >= 12)) {
    console.error(`${filename}: ${statements.length} potentially destructive changes require hash-bound reviewed reason/compatibility/recovery/reviewer`);
    failures++;
  }
}
if (failures) process.exitCode = 1;
else console.log("Migration safety review: passed (no unreviewed destructive statements)");
