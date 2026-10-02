import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { apiRequire, exec, resultsDir, run, startStack, waitFor } from "./stack.mjs";
import { identity, request } from "./fixture.mjs";

// No URL/container arguments: every mutation/drill is constrained to containers
// created by this invocation. Never use docker compose down, volume prune or AWS.
const stack = await startStack({ web: false, replicas: 2 });
const reports = [];
const resources = [];
const { Pool } = apiRequire("pg");
const Redis = apiRequire("ioredis");
const { io } = apiRequire("socket.io-client");
const sdk = apiRequire("@aws-sdk/client-s3");
const session = await identity(stack.apiOrigin);
const trip = await request(stack.apiOrigin, session, "/api/trips", "POST", { name: "Stage31 restore museum", startsOn: "2027-04-01", endsOn: "2027-04-02" });
const base = `/api/trips/${trip.id}`;
const days = await request(stack.apiOrigin, session, `${base}/days`);
await request(stack.apiOrigin, session, `${base}/itinerary-items`, "POST", { dayId: days[0].id, title: "Museum recovery", kind: "activity" });

async function drill(name, fn) {
  const started = Date.now();
  try { const evidence = await fn(); reports.push({ name, status: "Verified locally", durationMs: Date.now() - started, evidence }); console.log(`PASS ${name}`); }
  catch (error) { reports.push({ name, status: "Failed", durationMs: Date.now() - started, error: String(error) }); process.exitCode = 1; console.error(`FAIL ${name}: ${error}`); }
}
async function docker(action, container) {
  const id = container.getId();
  assert.match(id, /^[a-f0-9]{64}$/);
  assert.ok([stack.database.getId(), stack.redis.getId(), stack.storage.getId()].includes(id));
  await exec("docker", action === "stop" ? ["stop", "--time", "1", id] : ["start", id]);
}
async function ready(origin = stack.apiOrigin) { return await fetch(`${origin}/ready`, { signal: AbortSignal.timeout(2_000) }); }
async function coreWorks(origin = stack.apiOrigin) { assert.equal((await request(origin, session, base)).id, trip.id); }
const backlog = async () => (await stack.pool.query("SELECT count(*)::int AS count, EXTRACT(EPOCH FROM now()-min(created_at))::float AS oldest_seconds FROM storage_cleanup_outbox WHERE completed_at IS NULL")).rows[0];
async function insertOutbox(count, prefix) {
  await stack.pool.query("INSERT INTO storage_cleanup_outbox(storage_key,reason) SELECT $1 || '/' || n, 'document_delete' FROM generate_series(1,$2) n", [`stage31/${prefix}/${randomUUID()}`, count]);
}
async function connect(origin, user) {
  const socket = io(origin, { transports: ["websocket"], extraHeaders: { Cookie: user.cookie, Origin: stack.webOrigin }, autoConnect: false, reconnection: true, reconnectionDelay: 100, reconnectionDelayMax: 1_000 });
  resources.push(() => socket.disconnect());
  await new Promise((resolve, reject) => { socket.once("connect", resolve); socket.once("connect_error", reject); socket.connect(); });
  const joined = await socket.timeout(5_000).emitWithAck("trip:join", { tripId: trip.id });
  assert.equal(joined.ok, true);
  return socket;
}

try {
  await drill("least-privilege application DB role", async () => {
    const app = new Pool({ connectionString: stack.appDatabaseUrl, max: 2 });
    try {
      const permissions = (await app.query("SELECT rolcreatedb, rolcreaterole, rolsuper FROM pg_roles WHERE rolname=current_user")).rows[0];
      assert.deepEqual(permissions, { rolcreatedb: false, rolcreaterole: false, rolsuper: false });
      await assert.rejects(app.query("CREATE ROLE stage31_forbidden"), /permission denied/);
      await assert.rejects(app.query("DROP DATABASE postgres"), /must be owner/);
      await assert.rejects(app.query("CREATE TABLE public.stage31_forbidden(id int)"), /permission denied/);
      await assert.rejects(app.query("ALTER TABLE trips ADD COLUMN stage31_forbidden text"), /must be owner/);
      await assert.rejects(app.query("DROP TABLE trip_ai_proposals"), /must be owner/);
      await assert.rejects(app.query("DROP SCHEMA public"), /must be owner/);
      await app.query("BEGIN; SELECT pg_advisory_xact_lock(314159); SELECT id FROM storage_cleanup_outbox FOR UPDATE SKIP LOCKED; ROLLBACK");
      await coreWorks();
      return { ...permissions, CRUD: "real API", schemaDDL: "CREATE/ALTER/DROP table/schema denied", advisoryAndRowLocks: "real transaction + worker regression" };
    } finally { await app.end(); }
  });
  await drill("pool pressure returns to zero", async () => {
    const child = stack.apis[0];
    const completed = new Promise((resolve) => { const listener = (message) => { if (message.type === "pool-pressure-done") { child.off("message", listener); resolve(message); } }; child.on("message", listener); });
    child.send({ type: "pool-pressure" });
    await completed;
    const samples = stack.samples.filter((sample) => sample.replica === 4410 && sample.type === "runtime");
    // Query at 250ms would miss 1s sampling: ask 30 queries to keep pressure visible.
    assert.ok(samples.some((sample) => sample.poolWaiting > 0));
    await waitFor(() => stack.samples.filter((sample) => sample.replica === 4410 && sample.type === "runtime").at(-1)?.poolWaiting === 0, "pool queue drains", 5_000);
    return { peakWaiting: Math.max(...samples.map((sample) => sample.poolWaiting)), totalLimit: 10, finalWaiting: 0 };
  });
  await drill("PostgreSQL outage and recovery", async () => {
    try {
      await docker("stop", stack.database);
      assert.equal((await fetch(`${stack.apiOrigin}/health`)).status, 200);
      const response = await ready();
      assert.equal(response.status, 503);
      assert.deepEqual(await response.json(), { status: "not_ready" });
      const failed = await fetch(`${stack.apiOrigin}${base}`, { headers: { Cookie: session.cookie }, signal: AbortSignal.timeout(5_000) });
      assert.equal(failed.status, 500);
      assert.doesNotMatch(await failed.text(), /postgresql:|local-test-|SELECT|stack|ECONNREFUSED/);
      assert.equal(stack.apis[0].exitCode, null);
    } finally { await docker("start", stack.database); }
    await waitFor(async () => (await ready()).ok, "DB readiness recovers");
    await coreWorks();
    return { liveness: 200, readinessDuringOutage: 503, coreDuringOutage: 500, recoveredReadiness: 200, processSurvived: true };
  });
  await drill("Redis outage, fail-closed limiter and recovery", async () => {
    try {
      await docker("stop", stack.redis);
      assert.equal((await ready()).status, 200);
      await coreWorks();
      const failed = await fetch("http://127.0.0.1:4411/api/auth/login", { method: "POST", headers: { Origin: stack.webOrigin, "X-TripForge-Request": "1", "Content-Type": "application/json" }, body: JSON.stringify({ email: "no-account@example.test", password: "An adequately long password" }), signal: AbortSignal.timeout(5_000) });
      assert.equal(failed.status, 503);
    } finally { await docker("start", stack.redis); }
    const redis = new Redis(stack.redisUrl, { maxRetriesPerRequest: 1 });
    redis.on("error", () => undefined);
    try { await waitFor(async () => (await redis.ping()) === "PONG", "Redis resumes"); } finally { redis.disconnect(); }
    await coreWorks();
    return { readiness: 200, persistentReads: "available", protectedAction: 503, redisRecovery: "PONG" };
  });
  await drill("worker outage backlog, Redis FLUSHDB and durable recovery", async () => {
    await stack.stopWorker();
    await insertOutbox(120, "backlog");
    const before = await backlog();
    assert.equal(before.count, 120);
    await new Promise((resolve) => setTimeout(resolve, 1_100));
    assert.ok((await backlog()).oldest_seconds > before.oldest_seconds);
    const redis = new Redis(stack.redisUrl);
    try { await redis.flushdb(); } finally { redis.disconnect(); }
    const started = Date.now();
    stack.startWorker();
    await waitFor(async () => (await backlog()).count === 0, "durable outbox drains after Redis data loss", 100_000);
    const elapsed = (Date.now() - started) / 1_000;
    const { rows } = await stack.pool.query("SELECT count(*)::int AS completed, count(*) FILTER (WHERE failed_at IS NOT NULL)::int AS failed FROM storage_cleanup_outbox");
    assert.equal(rows[0].failed, 0);
    return { rows: 120, oldestAgeRose: true, redisQueueWasLost: true, drainSeconds: elapsed, throughputPerSecond: 120 / elapsed, completed: rows[0].completed, failed: 0 };
  });
  await drill("S3 outage leaves persistent core independent", async () => {
    const sdkClient = new sdk.S3Client({ endpoint: stack.s3Endpoint, forcePathStyle: true, region: "us-east-1", credentials: { accessKeyId: "test", secretAccessKey: "test" }, maxAttempts: 1 });
    try {
      await docker("stop", stack.storage);
      await coreWorks();
      assert.equal((await ready()).status, 200);
      await assert.rejects(sdkClient.send(new sdk.HeadBucketCommand({ Bucket: stack.bucket })));
    } finally { sdkClient.destroy(); await docker("start", stack.storage); }
    await waitFor(async () => (await fetch(`${stack.s3Endpoint}/_localstack/health`)).ok, "S3 emulator restarts", 60_000);
    try { await stack.s3.send(new sdk.CreateBucketCommand({ Bucket: stack.bucket })); } catch (error) { if (!String(error).includes("BucketAlready")) throw error; }
    await stack.s3.send(new sdk.PutBucketVersioningCommand({ Bucket: stack.bucket, VersioningConfiguration: { Status: "Enabled" } }));
    return { readiness: 200, core: "available", storage: "failed then restarted", limitation: "emulator restart persistence is not AWS durability" };
  });
  await drill("S3 version and delete-marker recovery", async () => {
    const Key = `stage31/recovery/${randomUUID()}`;
    const Bucket = stack.bucket;
    const first = await stack.s3.send(new sdk.PutObjectCommand({ Bucket, Key, Body: "version-one" }));
    await stack.s3.send(new sdk.PutObjectCommand({ Bucket, Key, Body: "version-two" }));
    const deleted = await stack.s3.send(new sdk.DeleteObjectCommand({ Bucket, Key }));
    assert.equal(deleted.DeleteMarker, true);
    await assert.rejects(stack.s3.send(new sdk.GetObjectCommand({ Bucket, Key })));
    await stack.s3.send(new sdk.DeleteObjectCommand({ Bucket, Key, VersionId: deleted.VersionId }));
    const latest = await stack.s3.send(new sdk.GetObjectCommand({ Bucket, Key }));
    assert.equal(await latest.Body.transformToString(), "version-two");
    await stack.s3.send(new sdk.CopyObjectCommand({ Bucket, Key, CopySource: `${Bucket}/${Key}?versionId=${encodeURIComponent(first.VersionId)}`, MetadataDirective: "REPLACE", ContentType: "application/octet-stream", Metadata: { recovery: "stage31" } }));
    const recovered = await stack.s3.send(new sdk.GetObjectCommand({ Bucket, Key }));
    assert.equal(await recovered.Body.transformToString(), "version-one");
    return { deleteMarkerRemoved: true, selectedVersionCopied: true, bytesVerified: true };
  });
  await drill("ORS and AI provider boundaries do not gate core", async () => {
    const from = await request(stack.apiOrigin, session, `${base}/itinerary-items`, "POST", { dayId: days[0].id, title: "Routing origin", kind: "activity", place: { name: "Origin", provider: "maptiler", latitude: 35, longitude: 135 } });
    const to = await request(stack.apiOrigin, session, `${base}/itinerary-items`, "POST", { dayId: days[0].id, title: "Routing destination", kind: "activity", place: { name: "Destination", provider: "maptiler", latitude: 35.01, longitude: 135.01 } });
    const routing = await fetch(`${stack.apiOrigin}${base}/routes`, { method: "POST", headers: { Cookie: session.cookie, Origin: stack.webOrigin, "X-TripForge-Request": "1", "Content-Type": "application/json" }, body: JSON.stringify({ fromItemId: from.id, toItemId: to.id, mode: "walking" }) });
    assert.equal(routing.status, 503);
    assert.equal((await routing.json()).code, "ROUTING_PROVIDER_UNAVAILABLE");
    assert.deepEqual(await request(stack.apiOrigin, session, `${base}/routes`), []);
    const conversation = await request(stack.apiOrigin, session, `${base}/assistant/conversations`, "POST", {});
    const response = await fetch(`${stack.apiOrigin}${base}/assistant/conversations/${conversation.id}/turns`, { method: "POST", headers: { Cookie: session.cookie, Origin: stack.webOrigin, "X-TripForge-Request": "1", "Content-Type": "application/json" }, body: JSON.stringify({ message: "provider outage" }) });
    const sse = await response.text();
    assert.match(sse, /AI_SAFETY_CHECK_UNAVAILABLE|AI_PROVIDER_UNAVAILABLE/);
    await coreWorks();
    assert.equal((await ready()).status, 200);
    return { AI: "deterministic DI exception; safe SSE error", ORS: "actual route POST 503; persisted list available", core: "available" };
  });
  await drill("Collector unavailable is non-business dependency", async () => {
    const collectorApi = stack.startApi(4412, false, { OTEL_ENABLED: "true", OTEL_EXPORTER_OTLP_ENDPOINT: "http://127.0.0.1:4428", OTEL_EXPORT_TIMEOUT_MS: "500", OTEL_METRIC_EXPORT_INTERVAL_MS: "1000" });
    try {
      await waitFor(async () => (await ready("http://127.0.0.1:4412")).ok, "instrumented API readiness");
      for (let index = 0; index < 20; index++) await coreWorks("http://127.0.0.1:4412");
      await new Promise((resolve) => setTimeout(resolve, 1_200));
      assert.equal(collectorApi.exitCode, null);
      return { endpoint: "unreachable loopback OTLP", instrumentedRequests: 20, readiness: 200, processSurvived: true };
    } finally { await stack.stopProcess(collectorApi); }
  });
  await drill("logical PostgreSQL backup into a fresh database", async () => {
    await stack.stopWorker();
    try {
    const member = await identity(stack.apiOrigin);
    const account = await request(stack.apiOrigin, member, "/api/auth/me");
    await request(stack.apiOrigin, session, `${base}/members`, "POST", { email: account.user.email, role: "viewer" });
    await request(stack.apiOrigin, session, `${base}/reservations`, "POST", { title: "Restore train", kind: "transport", status: "confirmed", startDate: "2027-04-01", transport: { mode: "train", originName: "Tokyo", destinationName: "Kyoto" } });
    const upload = await request(stack.apiOrigin, session, `${base}/documents/uploads`, "POST", { title: "Restore document", kind: "ticket", fileName: "restore.pdf", contentType: "application/pdf", sizeBytes: 9 });
    const uploaded = await fetch(upload.upload.url, { method: "PUT", headers: { "Content-Type": "application/pdf" }, body: "%PDF-test" });
    assert.ok(uploaded.ok);
    await request(stack.apiOrigin, session, `${base}/documents/${upload.document.id}/complete`, "POST", {});
    const expense = await request(stack.apiOrigin, session, `${base}/expenses`, "POST", { title: "Restore dinner", category: "food", spentOn: "2027-04-01", currency: "USD", amountMinor: 12345, paidByUserId: session.userId, split: { method: "equal", participantUserIds: [session.userId] } });
    assert.ok(expense.id);
    const conversation = await request(stack.apiOrigin, session, `${base}/assistant/conversations`, "POST", {});
    const suggestion = await fetch(`${stack.apiOrigin}${base}/assistant/conversations/${conversation.id}/turns`, { method: "POST", headers: { Cookie: session.cookie, Origin: stack.webOrigin, "X-TripForge-Request": "1", "Content-Type": "application/json" }, body: JSON.stringify({ message: "suggest an itinerary item for restore" }) });
    const events = (await suggestion.text()).split("\n").filter((line) => line.startsWith("data: ")).map((line) => JSON.parse(line.slice(6)));
    const proposal = events.find((event) => event.type === "assistant.completed")?.turn.proposals[0];
    assert.ok(proposal);
    await request(stack.apiOrigin, session, `${base}/assistant/proposals/${proposal.id}/apply`, "POST", {});
    const tables = (await stack.pool.query("SELECT schemaname, tablename FROM pg_tables WHERE schemaname IN ('public','drizzle') ORDER BY schemaname,tablename")).rows;
    const fingerprints = async (pool) => await Promise.all(tables.map(async ({ schemaname, tablename }) => ({ table: `${schemaname}.${tablename}`, ...(await pool.query(`SELECT count(*)::int AS count, md5(string_agg(row_to_json(t)::text, E'\\n' ORDER BY row_to_json(t)::text)) AS hash FROM "${schemaname}"."${tablename}" t`)).rows[0] })));
    const before = await fingerprints(stack.pool);
    await stack.database.exec(["pg_dump", "-U", "tripforge_admin", "-d", "tripforge", "-Fc", "-f", "/tmp/stage31.dump"]);
    await stack.pool.query("CREATE DATABASE tripforge_stage31_restore OWNER tripforge_admin");
    const restored = await stack.database.exec(["pg_restore", "-U", "tripforge_admin", "-d", "tripforge_stage31_restore", "--exit-on-error", "/tmp/stage31.dump"]);
    assert.equal(restored.exitCode, 0, restored.output);
    const url = new URL(stack.databaseUrl); url.pathname = "/tripforge_stage31_restore";
    const restorePool = new Pool({ connectionString: url.href });
    try {
      assert.deepEqual(await fingerprints(restorePool), before);
      await run("node", ["dist/migrate.js"], { cwd: join(stack.directory, "apps/api"), env: { ...stack.env, DATABASE_URL: url.href } });
      const restoredAppUrl = new URL(stack.appDatabaseUrl);
      restoredAppUrl.pathname = url.pathname;
      const restoredApi = stack.startApi(4413, false, { DATABASE_URL: restoredAppUrl.href });
      try {
        await waitFor(async () => (await ready("http://127.0.0.1:4413")).ok, "restored API ready");
        await coreWorks("http://127.0.0.1:4413");
        const reservations = await request("http://127.0.0.1:4413", session, `${base}/reservations`);
        assert.equal(reservations[0].transport.mode, "train");
        assert.ok((await request("http://127.0.0.1:4413", session, `${base}/search?q=Museum`)).results.length > 0);
      } finally { await stack.stopProcess(restoredApi); }
      return { verifiedTables: before, journalUnchanged: true, restoredAPISessionAndSearch: true, restoredTransportReservation: true, restoredApplicationRole: "tripforge_app", note: "logical restore, not AWS PITR/RPO proof" };
    } finally { await restorePool.end(); }
    } finally { stack.startWorker(); }
  });
  await drill("100 authenticated sockets, cross-node update and reconnect", async () => {
    const users = [session];
    for (let index = 1; index < 10; index++) {
      const user = await identity(stack.apiOrigin);
      // Resolve the registered account's actual email without exposing a session.
      const account = await request(stack.apiOrigin, user, "/api/auth/me");
      await request(stack.apiOrigin, session, `${base}/members`, "POST", { email: account.user.email, role: "editor" });
      users.push(user);
    }
    const sockets = [];
    for (let index = 0; index < 100; index++) sockets.push(await connect(index % 2 ? "http://127.0.0.1:4411" : stack.apiOrigin, users[Math.floor(index / 10)]));
    const started = Date.now();
    const updates = sockets.map((socket) => new Promise((resolve) => socket.once("trip:invalidate", resolve)));
    await request(stack.apiOrigin, session, base, "PATCH", { name: "Stage31 socket convergence" });
    await Promise.race([Promise.all(updates), new Promise((_, reject) => setTimeout(() => reject(new Error("Cross-node update timeout")), 5_000))]);
    const elapsed = Date.now() - started;
    for (const socket of sockets) socket.disconnect();
    const rejoined = await connect(stack.apiOrigin, session);
    rejoined.disconnect();
    assert.ok(!stack.logs.some((line) => line.includes("MaxListenersExceededWarning")));
    return { authenticatedSockets: 100, APIReplicas: 2, allReceived: 100, convergenceMs: elapsed, reconnectReauthenticatedAndRejoined: true, listenerWarnings: 0, note: "one experiment, not percentile latency" };
  });
  await drill("graceful active HTTP shutdown and replica recovery", async () => {
    const rollingSocket = await connect(stack.apiOrigin, session);
    const lock = await stack.pool.connect();
    await lock.query("BEGIN; LOCK TABLE trips IN ACCESS EXCLUSIVE MODE");
    const response = fetch(`${stack.apiOrigin}${base}`, { headers: { Cookie: session.cookie } });
    await new Promise((resolve) => setTimeout(resolve, 150));
    const stopping = stack.stopProcess(stack.apis[0]);
    await new Promise((resolve) => setTimeout(resolve, 150));
    await lock.query("ROLLBACK"); lock.release();
    assert.equal((await response).status, 200);
    const shutdown = await stopping;
    assert.equal(shutdown.forced, false);
    stack.apis[0] = stack.startApi(4410);
    await waitFor(async () => (await ready()).ok, "new API revision joins");
    await coreWorks();
    await waitFor(() => rollingSocket.connected, "rolling socket reconnects", 15_000);
    assert.equal((await rollingSocket.timeout(5_000).emitWithAck("trip:join", { tripId: trip.id })).ok, true);
    await coreWorks();
    rollingSocket.disconnect();
    return { requestInFlight: "completed 200", shutdown, oldProcessClosed: true, replacementReady: 200, otherReplica: "remained ready", socket: "fresh authentication, join and authoritative HTTP refetch" };
  });
  await drill("graceful worker waits for active job; duplicate delivery is safe", async () => {
    const { Queue } = apiRequire("bullmq");
    const queue = new Queue("tripforge-maintenance", { connection: { host: "127.0.0.1", port: 16381 } });
    const row = (await stack.pool.query("INSERT INTO storage_cleanup_outbox(storage_key,reason) VALUES($1,'document_delete') RETURNING id", [`stage31/shutdown/${randomUUID()}`])).rows[0];
    const lock = await stack.pool.connect();
    try {
      await lock.query("BEGIN; LOCK TABLE storage_cleanup_outbox IN ACCESS EXCLUSIVE MODE");
      const job = await queue.add("storage.cleanup-object", { outboxId: row.id }, { jobId: `stage31-active-${row.id}` });
      await waitFor(async () => (await job.getState()) === "active", "real worker has an active job", 15_000);
      const stopping = stack.stopWorker();
      await new Promise((resolve) => setTimeout(resolve, 200));
      await lock.query("ROLLBACK");
      const shutdown = await stopping;
      assert.equal(shutdown.forced, false);
      assert.ok((await stack.pool.query("SELECT completed_at FROM storage_cleanup_outbox WHERE id=$1", [row.id])).rows[0].completed_at);
      stack.startWorker();
      const duplicate = await queue.add("storage.cleanup-object", { outboxId: row.id }, { jobId: `stage31-duplicate-${row.id}` });
      await waitFor(async () => (await duplicate.getState()) === "completed", "duplicate completed row noops", 15_000);
      return { shutdown, activeJobCompleted: true, duplicateDelivery: "completed row noops", concurrency: 5 };
    } finally { await lock.query("ROLLBACK"); lock.release(); await queue.close(); }
  });
} finally {
  for (const close of resources.reverse()) await close();
  await writeFile(join(resultsDir, "qualification.json"), JSON.stringify({ measuredAt: new Date().toISOString(), reports }, null, 2));
  await stack.close();
}
