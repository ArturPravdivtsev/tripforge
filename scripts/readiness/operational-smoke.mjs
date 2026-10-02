import { randomUUID } from "node:crypto";
import { parseArgs } from "node:util";

export function smokeOrigin(value) {
  const url = new URL(value);
  const loopback = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  if (!(url.protocol === "https:" || (loopback && url.protocol === "http:")) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error("Explicit HTTPS origin (or local loopback HTTP) required");
  return url.origin;
}

export function disposableCredentials(env) {
  const prefix = env.SMOKE_DISPOSABLE_PREFIX;
  if (env.SMOKE_DISPOSABLE_ACK !== "1" || !/^stage31-smoke-[a-z0-9-]{3,50}$/.test(prefix ?? "") || !env.SMOKE_EMAIL?.startsWith(`${prefix}@`) || !env.SMOKE_PASSWORD || env.SMOKE_PASSWORD.length < 12) throw new Error("Mutation refused: explicitly acknowledge a provisioned disposable stage31-smoke account and supply matching prefix/email/password");
  return { prefix, email: env.SMOKE_EMAIL, password: env.SMOKE_PASSWORD };
}

export async function smoke({ api, web, disposable = false }, env = process.env) {
  api = smokeOrigin(api); web = smokeOrigin(web);
  // Validate authority before even the first external request.
  const credentials = disposable ? disposableCredentials(env) : undefined;
  let cookie;
  let tripId;
  async function call(origin, path, method = "GET", body) {
    const response = await fetch(`${origin}${path}`, { method, redirect: "error", signal: AbortSignal.timeout(12_000), headers: { Origin: web, "X-TripForge-Request": "1", "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    if (!response.ok) throw new Error(`Smoke ${method} ${path}: HTTP ${response.status}`);
    return response;
  }
  await call(web, "/health");
  await call(api, "/health");
  const readiness = await (await call(api, "/ready")).json();
  if (readiness.status !== "ready") throw new Error("API not ready");
  if (!credentials) { console.log("PASS read-only smoke: web health, API health/readiness; no sessions or entities created"); return; }
  const cleanupErrors = [];
  try {
    const login = await call(api, "/api/auth/login", "POST", { email: credentials.email, password: credentials.password });
    cookie = login.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ");
    if (!cookie) throw new Error("Disposable login did not set a cookie");
    const account = await (await call(api, "/api/auth/me")).json();
    if (account.user.email !== credentials.email) throw new Error("Disposable identity mismatch");
    const trip = await (await call(api, "/api/trips", "POST", { name: `${credentials.prefix}-${randomUUID()}`, startsOn: "2027-04-01", endsOn: "2027-04-02" })).json();
    if (!/^[0-9a-f-]{36}$/.test(trip.id)) throw new Error("Invalid created Trip identity");
    tripId = trip.id;
    const read = await (await call(api, `/api/trips/${tripId}`)).json();
    if (read.id !== tripId) throw new Error("Created Trip read mismatch");
  } finally {
    if (tripId) try { await call(api, `/api/trips/${tripId}`, "DELETE"); } catch { cleanupErrors.push("Created disposable Trip cleanup failed; operator must inspect its ID in the isolated environment"); }
    if (cookie) try { await call(api, "/api/auth/logout", "POST", {}); } catch { cleanupErrors.push("Disposable session logout failed"); }
    if (cleanupErrors.length) throw new Error(cleanupErrors.join("; "));
  }
  console.log("PASS disposable smoke: login/me, create/read/delete Trip, logout; pre-provisioned account retained");
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const { values } = parseArgs({ options: { api: { type: "string" }, web: { type: "string" }, disposable: { type: "boolean", default: false } } });
  if (!values.api || !values.web) throw new Error("Use --api=<explicit origin> --web=<explicit origin>; default is read-only");
  await smoke(values);
}
