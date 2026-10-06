import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { resultsDir, root, snapshot } from "./stack.mjs";

// Next rewrites next-env.d.ts: all builds/check aggregates run in a copied tree.
const before = createHash("sha256").update(await readFile(join(root, "apps/web/next-env.d.ts"))).digest("hex");
const directory = await snapshot();
await mkdir(resultsDir, { recursive: true });
const env = { ...process.env, GIT_DIR: join(root, ".git"), GIT_WORK_TREE: directory, API_ORIGIN: "http://127.0.0.1:4000", WEB_ORIGIN: "http://127.0.0.1:3000", S3_UPLOAD_ORIGIN: "http://127.0.0.1:4566", NEXT_PUBLIC_MAPTILER_KEY: "test", NEXT_TELEMETRY_DISABLED: "1", OTEL_ENABLED: "false" };
const commands = ["docs:check", "db:generate", "db:check", "lint", "typecheck", "test", "test:coverage", "test:a11y", "security:audit", "security:secrets", "test:security", "build", "perf:bundle:check", "perf:test", "observability:config:check", "observability:test", "ai:test", "ai:eval", "check", "test:integration", "check:full", "peers check", "ci:workflow:test", "ci:workflow:check", "readiness:unit", "migrations:safety"];
const results = [];
for (const command of commands) {
  console.log(`GATE ${command}`);
  const started = Date.now();
  let output = "";
  const child = spawn("pnpm", command.split(" "), { cwd: directory, env, stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { output += chunk; });
  const code = await new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", resolve); });
  await writeFile(join(resultsDir, `gate-${command.replaceAll(":", "-").replaceAll(" ", "-")}.log`), output);
  results.push({ command, exitCode: code, seconds: (Date.now() - started) / 1000 });
  console.log(`${code === 0 ? "PASS" : "FAIL"} ${command} (${results.at(-1).seconds}s)`);
  if (code !== 0) console.error(output.slice(-3_000));
  await writeFile(join(resultsDir, "gates.json"), JSON.stringify({ directory, results }, null, 2));
}
const after = createHash("sha256").update(await readFile(join(root, "apps/web/next-env.d.ts"))).digest("hex");
if (after !== before || results.some(({ exitCode }) => exitCode !== 0)) process.exitCode = 1;
