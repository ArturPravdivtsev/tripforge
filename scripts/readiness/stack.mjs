import { createHash } from "node:crypto";
import { execFile, fork, spawn } from "node:child_process";
import { createRequire } from "node:module";
import { cp, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

export const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const apiRequire = createRequire(join(root, "apps/api/package.json"));
export const exec = promisify(execFile);
export const webOrigin = "http://127.0.0.1:3310";
export const apiOrigin = "http://127.0.0.1:4410";
const runLabel = process.env.READINESS_RUN_LABEL;
if (runLabel !== undefined && !/^[a-z0-9-]{1,50}$/.test(runLabel)) throw new Error("Invalid disposable readiness run label");
export const resultsDir = join(root, "readiness-results", runLabel ?? "");

export async function waitFor(predicate, label, timeout = 30_000) {
  const deadline = Date.now() + timeout;
  let last;
  do {
    try { if (await predicate()) return; } catch (error) { last = error; }
    await new Promise((done) => setTimeout(done, 200));
  } while (Date.now() < deadline);
  throw new Error(`Timed out: ${label}`, { cause: last });
}

export async function run(command, args, options = {}) {
  const child = spawn(command, args, { cwd: root, stdio: "inherit", ...options });
  await new Promise((done, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => code === 0 ? done() : reject(new Error(`${command} exited ${code ?? signal}`)));
  });
}

export async function snapshot() {
  const directory = await mkdtemp(join(tmpdir(), "tripforge-stage31-"));
  const { stdout } = await exec("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { cwd: root });
  for (const file of new Set(stdout.split("\0").filter(Boolean))) {
    await mkdir(dirname(join(directory, file)), { recursive: true });
    await cp(join(root, file), join(directory, file));
  }
  await run("pnpm", ["install", "--frozen-lockfile"], { cwd: directory });
  return directory;
}

export async function startStack({ web = true, replicas = 1, worker = true } = {}) {
  const ports = [...(web ? [3310] : []), ...Array.from({ length: replicas }, (_, index) => 4410 + index)];
  for (const port of ports) {
    let occupied = false;
    try { await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(500) }); occupied = true; } catch { /* No existing HTTP listener. */ }
    if (occupied) throw new Error(`Port ${port} occupied: stop the earlier readiness stack before running another qualification`);
  }
  await mkdir(resultsDir, { recursive: true });
  const originalHash = createHash("sha256").update(await readFile(join(root, "apps/web/next-env.d.ts"))).digest("hex");
  // Preserve the caller's file, including a clean checkout; do not require one
  // developer's local generated-file hash. close() verifies it is unchanged.
  const { PostgreSqlContainer } = apiRequire("@testcontainers/postgresql");
  const { RedisContainer } = apiRequire("@testcontainers/redis");
  const { LocalstackContainer } = apiRequire("@testcontainers/localstack");
  const containers = [];
  const processes = [];
  const samples = [];
  const logs = [];
  let s3;
  let pool;
  let directory;

  async function stopProcess(child) {
    if (!child || child.exitCode !== null || child.signalCode) return { forced: false, alreadyStopped: true };
    let forced = false;
    const started = Date.now();
    const stopped = new Promise((done) => child.once("exit", done));
    child.kill("SIGTERM");
    const timeout = setTimeout(() => { forced = true; child.kill("SIGKILL"); }, 20_000);
    await stopped;
    clearTimeout(timeout);
    return { forced, elapsedMs: Date.now() - started, exitCode: child.exitCode, signal: child.signalCode };
  }
  async function close() {
    for (const child of [...processes].reverse()) await stopProcess(child);
    await pool?.end();
    s3?.destroy();
    for (const container of [...containers].reverse()) await container.stop();
    await writeFile(join(resultsDir, "runtime-samples.json"), JSON.stringify(samples, null, 2));
    const afterHash = createHash("sha256").update(await readFile(join(root, "apps/web/next-env.d.ts"))).digest("hex");
    if (afterHash !== originalHash) throw new Error("User next-env.d.ts changed during qualification");
  }

  try {
    const database = await new PostgreSqlContainer("postgres:18.6-bookworm")
      .withExposedPorts({ container: 5432, host: 15431 })
      .withDatabase("tripforge").withUsername("tripforge_admin").withPassword("local-test-admin").start();
    containers.push(database);
    const redis = await new RedisContainer("redis:8.10.1-alpine").withExposedPorts({ container: 6379, host: 16381 }).start();
    containers.push(redis);
    const storage = await new LocalstackContainer("localstack/localstack:4.14.0")
      .withExposedPorts({ container: 4566, host: 14561 })
      .withEnvironment({ SERVICES: "s3" }).start();
    containers.push(storage);
    const { Pool } = apiRequire("pg");
    pool = new Pool({ connectionString: database.getConnectionUri(), max: 2, connectionTimeoutMillis: 2_000 });
    pool.on("error", () => undefined);
    directory = await snapshot();
    const s3Endpoint = storage.getConnectionUri();
    const env = {
      ...process.env,
      NODE_ENV: "test",
      DATABASE_URL: database.getConnectionUri(),
      DATABASE_POOL_MAX: "10",
      REDIS_URL: redis.getConnectionUrl(),
      WEB_ORIGIN: webOrigin,
      SECURITY_RATE_LIMITING_ENABLED: "false",
      S3_ENDPOINT: s3Endpoint,
      S3_PUBLIC_ENDPOINT: s3Endpoint,
      S3_FORCE_PATH_STYLE: "true",
      S3_BUCKET: "tripforge-readiness",
      S3_REGION: "us-east-1",
      AWS_ACCESS_KEY_ID: "test",
      AWS_SECRET_ACCESS_KEY: "test",
      AWS_SESSION_TOKEN: "",
      OPENAI_API_KEY: "stage31-provider-boundary-not-a-real-key",
      AI_ASSISTANT_ENABLED: "true",
      OPENROUTESERVICE_API_KEY: "",
      OTEL_ENABLED: "false",
      LOG_LEVEL: "warn",
      READINESS_API_DIR: join(directory, "apps/api"),
      NEXT_PUBLIC_API_URL: apiOrigin,
      NEXT_PUBLIC_S3_UPLOAD_ORIGIN: new URL(s3Endpoint).origin,
      NEXT_PUBLIC_MAPTILER_KEY: "readiness-provider-boundary",
      NEXT_TELEMETRY_DISABLED: "1",
    };
    await run("pnpm", web ? ["build"] : ["--filter", "@tripforge/api...", "build"], { cwd: directory, env });
    await run("node", ["dist/migrate.js"], { cwd: join(directory, "apps/api"), env });
    await run("node", ["dist/migrate.js"], { cwd: join(directory, "apps/api"), env });
    // The schema owner/migrator owns objects; normal traffic only receives DML privileges.
    await pool.query("CREATE ROLE tripforge_app LOGIN PASSWORD 'local-test-app' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION");
    await pool.query("GRANT CONNECT ON DATABASE tripforge TO tripforge_app; GRANT USAGE ON SCHEMA public TO tripforge_app; GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO tripforge_app; GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO tripforge_app");
    await pool.query("ALTER DEFAULT PRIVILEGES FOR ROLE tripforge_admin IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO tripforge_app; ALTER DEFAULT PRIVILEGES FOR ROLE tripforge_admin IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO tripforge_app");
    const appUrl = new URL(database.getConnectionUri());
    appUrl.username = "tripforge_app";
    appUrl.password = "local-test-app";
    env.DATABASE_URL = appUrl.href;
    const sdk = apiRequire("@aws-sdk/client-s3");
    s3 = new sdk.S3Client({ endpoint: s3Endpoint, forcePathStyle: true, region: "us-east-1", credentials: { accessKeyId: "test", secretAccessKey: "test" } });
    await s3.send(new sdk.CreateBucketCommand({ Bucket: env.S3_BUCKET }));
    await s3.send(new sdk.PutBucketCorsCommand({ Bucket: env.S3_BUCKET, CORSConfiguration: { CORSRules: [{ AllowedOrigins: [webOrigin], AllowedMethods: ["GET", "PUT", "HEAD"], AllowedHeaders: ["*"], ExposeHeaders: ["ETag"] }] } }));
    await s3.send(new sdk.PutBucketVersioningCommand({ Bucket: env.S3_BUCKET, VersioningConfiguration: { Status: "Enabled" } }));

    function startApi(port, protectedActions = false, overrides = {}) {
      const child = fork(join(root, "scripts/readiness/test-api.mjs"), [], {
        cwd: join(directory, "apps/api"),
        env: { ...env, PORT: String(port), SECURITY_RATE_LIMITING_ENABLED: String(protectedActions), ...overrides },
        stdio: ["ignore", "pipe", "pipe", "ipc"],
      });
      child.on("message", (sample) => samples.push({ ...sample, replica: port, at: new Date().toISOString() }));
      child.on("error", (error) => logs.push(`Test API process error: ${error.code ?? "unknown"}`));
      child.stdout.on("data", (data) => logs.push(data.toString()));
      child.stderr.on("data", (data) => logs.push(data.toString()));
      processes.push(child);
      return child;
    }
    const apis = Array.from({ length: replicas }, (_, index) => startApi(4410 + index, index === 1));
    for (let index = 0; index < replicas; index++) await waitFor(async () => {
      if (apis[index].exitCode !== null) throw new Error(`Test API exited ${apis[index].exitCode}`);
      return (await fetch(`http://127.0.0.1:${4410 + index}/ready`)).ok;
    }, "API readiness", 60_000);
    function startWorker() {
      const child = spawn("node", ["dist/worker.js"], { cwd: join(directory, "apps/api"), env: { ...env, DATABASE_POOL_MAX: "4" }, stdio: ["ignore", "pipe", "pipe"] });
      child.stdout.on("data", (data) => logs.push(data.toString()));
      child.stderr.on("data", (data) => logs.push(data.toString()));
      processes.push(child);
      return child;
    }
    let workerProcess = worker ? startWorker() : undefined;
    if (web) {
      const webDirectory = join(directory, "apps/web");
      await cp(join(webDirectory, ".next/static"), join(webDirectory, ".next/standalone/apps/web/.next/static"), { recursive: true });
      const child = spawn("node", [join(webDirectory, ".next/standalone/apps/web/server.js")], {
        cwd: webDirectory, env: { ...env, NODE_ENV: "production", PORT: "3310", HOSTNAME: "127.0.0.1" }, stdio: ["ignore", "pipe", "pipe"],
      });
      child.stdout.on("data", (data) => process.stdout.write(data));
      child.stderr.on("data", (data) => process.stderr.write(data));
      processes.push(child);
      await waitFor(async () => (await fetch(`${webOrigin}/health`)).ok, "Next production server", 60_000);
    }
    const descriptor = { apiOrigin, webOrigin, directory, databaseUrl: database.getConnectionUri(), appDatabaseUrl: appUrl.href, redisUrl: redis.getConnectionUrl(), s3Endpoint, bucket: env.S3_BUCKET };
    await writeFile(join(resultsDir, "stack.json"), JSON.stringify(descriptor, null, 2), { mode: 0o600 });
    return { ...descriptor, database, redis, storage, s3, pool, samples, logs, apis, env, close, stopProcess, startApi,
      stopWorker: async () => { const result = await stopProcess(workerProcess); workerProcess = undefined; return result; },
      startWorker: () => { workerProcess = startWorker(); return workerProcess; },
    };
  } catch (error) {
    console.error(logs.slice(-10).join("\n"));
    await close();
    throw error;
  }
}
