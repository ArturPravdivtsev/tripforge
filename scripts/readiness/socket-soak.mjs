import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { apiRequire, resultsDir } from "./stack.mjs";
import { assertLocalTarget } from "./safety.mjs";
import { request } from "./fixture.mjs";

// Read-only companion to a RUNNING disposable load stack, not an arbitrary URL.
// No credentials/URLs accepted on CLI; no DB writes, fake rooms or live providers.
const durationSeconds = Number(process.env.REALTIME_SOAK_SECONDS ?? 1800);
assert.ok(Number.isInteger(durationSeconds) && durationSeconds >= 60 && durationSeconds <= 3600);
const stack = JSON.parse(await readFile(join(resultsDir, "stack.json"), "utf8"));
const fixture = JSON.parse(await readFile(join(resultsDir, "load-fixture.json"), "utf8"));
assertLocalTarget(stack.apiOrigin);
assert.equal(stack.apiOrigin, "http://127.0.0.1:4410");
assert.equal(stack.webOrigin, "http://127.0.0.1:3310");
assert.ok(fixture.sessions.length >= 20 && fixture.sessions.every((session) => /^stage31-[0-9a-f-]+@example\.test$/.test(session.email)));
const { io } = apiRequire("socket.io-client");
const sockets = [];
const samples = [];
let invalidations = 0;
let joins = 0;
let reconnects = 0;
let failures = 0;
let interrupted = false;
let stop;
const stopped = new Promise((done) => { stop = done; });
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => { interrupted = true; stop(); });
const startedAt = new Date().toISOString();
let sampler;
let deadline;
try {
  for (let index = 0; index < 100; index++) {
    const user = fixture.sessions[index % fixture.sessions.length];
    await request(stack.apiOrigin, user, `/api/trips/${user.tripId}`);
    const socket = io(stack.apiOrigin, { transports: ["websocket"], autoConnect: false, extraHeaders: { Cookie: user.cookie, Origin: stack.webOrigin }, reconnectionDelay: 250, reconnectionDelayMax: 1000 });
    sockets.push(socket);
    socket.on("trip:invalidate", () => { invalidations++; });
    let first = true;
    const initial = new Promise((resolve, reject) => {
      socket.once("connect_error", reject);
      socket.on("connect", () => {
        void (async () => {
          const joined = await socket.timeout(5000).emitWithAck("trip:join", { tripId: user.tripId });
          assert.equal(joined.ok, true);
          await request(stack.apiOrigin, user, `/api/trips/${user.tripId}`);
          joins++;
          if (first) { first = false; resolve(); } else reconnects++;
        })().catch(() => { failures++; reject(new Error("Socket authorization/join/refetch failed")); });
      });
    });
    socket.on("connect_error", () => { failures++; });
    socket.connect();
    await initial;
  }
  sampler = setInterval(() => {
    samples.push({ at: new Date().toISOString(), connected: sockets.filter((socket) => socket.connected).length, invalidations, joins, reconnects, failures, listeners: sockets.reduce((sum, socket) => sum + socket.listeners("trip:invalidate").length, 0), clientRss: process.memoryUsage().rss, clientHeap: process.memoryUsage().heapUsed });
  }, 10_000);
  console.log(`Realtime soak: 100 real authenticated sockets for ${durationSeconds}s on disposable load fixture`);
  process.send?.({ type: "socket-soak-ready" });
  deadline = setTimeout(stop, durationSeconds * 1000);
  await stopped;
  assert.equal(interrupted, false);
  assert.equal(failures, 0);
  assert.ok(samples.length >= Math.floor(durationSeconds / 10) - 1);
  assert.ok(samples.every((sample) => sample.connected === 100 && sample.listeners === 100));
  assert.ok(invalidations > 0);
  console.log(`PASS realtime soak: ${invalidations} real invalidations, stable connected/listener counts`);
} finally {
  clearInterval(sampler); clearTimeout(deadline);
  for (const socket of sockets) socket.disconnect();
  await writeFile(join(resultsDir, "socket-soak.json"), JSON.stringify({ startedAt, endedAt: new Date().toISOString(), durationSeconds, interrupted, failures, invalidations, joins, reconnects, samples, limitation: "single-node sustained socket/resource observation; separate two-node drill proves cross-node/restart" }, null, 2));
}
