import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";

const fixture = JSON.parse(open(__ENV.FIXTURE));
const origin = __ENV.API_ORIGIN;
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin) || __ENV.DISPOSABLE_LOCAL !== "1") throw new Error("k6 refuses non-disposable/production targets");
const mode = __ENV.MODE || "smoke";
const durations = { smoke: "1m", load: "10m", soak: "30m" };
if (!["smoke", "load", "stress", "soak"].includes(mode)) throw new Error("Unknown load mode");
const failures = new Rate("unexpected_failure");
const core = new Trend("core_duration", true);
export const options = {
  summaryTrendStats: ["avg", "min", "med", "max", "p(95)", "p(99)"],
  ...(mode === "stress" ? { stages: [25,50,75,100].map((target) => ({ target, duration: __ENV.STAGE_DURATION || "2m" })) }
    : { vus: Number(__ENV.VUS || (mode === "smoke" ? 2 : 20)), duration: __ENV.DURATION || durations[mode] }),
  thresholds: { core_duration: ["p(95)<500", "p(99)<1000"], unexpected_failure: ["rate<0.01"], checks: ["rate>0.99"] },
};

export default function () {
  const session = fixture.sessions[(__VU - 1) % fixture.sessions.length];
  const index = __ITER % 10;
  const root = `/api/trips/${session.tripId}`;
  const reads = ["/api/trips?pageSize=20", root, `${root}/days`, `${root}/itinerary-items`, `${root}/reservations`, __ITER % 20 < 10 ? `${root}/expenses` : `${root}/expenses/balances`, `${root}/documents`, __ITER % 20 < 10 ? `${root}/search?q=Museum&limit=10` : "/api/notifications?limit=20"];
  const path = index < 8 ? reads[index] : index === 8 ? `${root}/expenses/balances` : "/api/notifications/read-all";
  const params = { headers: { Cookie: session.cookie, Origin: "http://127.0.0.1:3310", "X-TripForge-Request": "1", "Content-Type": "application/json" }, timeout: "10s", tags: { name: index < 8 ? `read-${index}` : `write-${index}` } };
  // 80% reads / 20% idempotent bounded writes; no rows grow per iteration.
  const response = index === 8 ? http.patch(`${origin}${root}`, JSON.stringify({ name: `Stage31 Load ${(__VU - 1) % fixture.sessions.length}` }), params)
    : index === 9 ? http.post(`${origin}${path}`, "{}", params) : http.get(`${origin}${path}`, params);
  failures.add(response.status === 0 || response.status >= 500);
  core.add(response.timings.duration);
  check(response, { "core request succeeds": (result) => result.status >= 200 && result.status < 300 });
  sleep(Number(__ENV.THINK_SECONDS || "0.1"));
}

export function handleSummary(data) {
  return { [__ENV.SUMMARY]: JSON.stringify({ mode, dataset: fixture.dataset, metrics: data.metrics, state: data.state }, null, 2) };
}
