#!/usr/bin/env bash
set -euo pipefail

network="tripforge-ci-${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-1}-$$"
postgres="${network}-postgres"
redis="${network}-redis"
api="${network}-api"
web="${network}-web"
api_image="${SMOKE_API_IMAGE:-tripforge-ci-api:local}"
migrate_image="${SMOKE_MIGRATE_IMAGE:-tripforge-ci-migrate:local}"
web_image="${SMOKE_WEB_IMAGE:-tripforge-ci-web:local}"

cleanup() {
  status=$?
  if [[ "$status" -ne 0 ]]; then
    for container in "$api" "$web" "$postgres" "$redis"; do
      if docker inspect "$container" >/dev/null 2>&1; then
        echo "Smoke diagnostics for ${container}:" >&2
        docker inspect --format 'status={{.State.Status}} exit={{.State.ExitCode}} error={{.State.Error}}' "$container" >&2 || true
        docker logs --tail 100 "$container" >&2 || true
      fi
    done
  fi
  docker rm -f "$web" "$api" "$redis" "$postgres" >/dev/null 2>&1 || true
  docker network rm "$network" >/dev/null 2>&1 || true
  return "$status"
}
trap cleanup EXIT

docker network create "$network" >/dev/null
docker run -d --name "$postgres" --network "$network" \
  -e POSTGRES_USER=tripforge \
  -e POSTGRES_PASSWORD=tripforge \
  -e POSTGRES_DB=tripforge \
  --health-cmd="pg_isready -U tripforge -d tripforge" \
  --health-interval=2s --health-timeout=2s --health-retries=30 \
  postgres:18.6-bookworm@sha256:3725f4e2499eef5134592b3b4ab79a543ed7f8e533b05b5b637af926630f6650 >/dev/null
docker run -d --name "$redis" --network "$network" \
  redis:8.10.1-alpine >/dev/null

for _ in {1..60}; do
  if [[ "$(docker inspect --format '{{.State.Health.Status}}' "$postgres")" == "healthy" ]]; then
    break
  fi
  sleep 1
done
[[ "$(docker inspect --format '{{.State.Health.Status}}' "$postgres")" == "healthy" ]]

for _ in 1 2; do
  docker run --rm --network "$network" \
    -e NODE_ENV=production \
    -e DATABASE_URL="postgresql://tripforge:tripforge@${postgres}:5432/tripforge" \
    "$migrate_image"
done

# The disposable Redis is plaintext; production configuration requires TLS.
docker run -d --name "$api" --network "$network" -p 127.0.0.1::4000 \
  -e NODE_ENV=development \
  -e PORT=4000 \
  -e OTEL_ENABLED=false \
  -e AI_ASSISTANT_ENABLED=false \
  -e DATABASE_URL="postgresql://tripforge:tripforge@${postgres}:5432/tripforge" \
  -e WEB_ORIGIN="http://${web}:3000" \
  -e REDIS_URL="redis://${redis}:6379" \
  -e S3_BUCKET=tripforge-documents \
  -e S3_REGION=us-east-1 \
  -e AWS_ACCESS_KEY_ID=test \
  -e AWS_SECRET_ACCESS_KEY=test \
  "$api_image" >/dev/null
api_port="$(docker port "$api" 4000/tcp | sed 's/.*://')"

for _ in {1..60}; do
  if curl --fail --silent "http://127.0.0.1:${api_port}/health" >/dev/null; then
    break
  fi
  sleep 1
done
curl --fail --silent "http://127.0.0.1:${api_port}/health" >/dev/null
curl --fail --silent "http://127.0.0.1:${api_port}/ready" >/dev/null

docker run -d --name "$web" --network "$network" -p 127.0.0.1::3000 \
  -e NODE_ENV=production \
  -e OTEL_ENABLED=false \
  -e API_ORIGIN="http://${api}:4000" \
  -e WEB_ORIGIN="http://${web}:3000" \
  -e S3_UPLOAD_ORIGIN=http://127.0.0.1:4566 \
  "$web_image" >/dev/null
web_port="$(docker port "$web" 3000/tcp | sed 's/.*://')"

for _ in {1..60}; do
  if curl --fail --silent "http://127.0.0.1:${web_port}/health" >/dev/null; then break; fi
  sleep 1
done

docker exec -i "$web" node <<'NODE'
const base = process.env.WEB_ORIGIN;
const headers = {
  "Content-Type": "application/json",
  Origin: base,
  "Sec-Fetch-Site": "same-origin",
  "X-TripForge-Request": "1",
};

async function check() {
  const registered = await fetch(`${base}/api/auth/register`, {
    method: "POST",
    headers,
    body: JSON.stringify({ email: "container-smoke@example.com", password: "a sufficiently long password" }),
  });
  if (registered.status !== 201) throw new Error(`Registration failed: ${registered.status}`);
  const cookie = registered.headers.get("set-cookie")?.split(";", 1)[0];
  if (!cookie) throw new Error("Registration did not set a session cookie");
  if (!registered.headers.get("set-cookie").includes("HttpOnly")) throw new Error("Missing HttpOnly");

  const me = await fetch(`${base}/api/auth/me`, { headers: { Cookie: cookie } });
  if (me.status !== 200) throw new Error(`Session check failed: ${me.status}`);

  // Exercise the actual standalone upgrade path, not just a rewritten HTTP GET.
  const { request } = await import("node:http");
  await new Promise((resolve, reject) => {
    const upgrade = request(`${base}/socket.io?EIO=4&transport=websocket`, {
      headers: {
        Origin: base, Cookie: cookie, Connection: "Upgrade", Upgrade: "websocket",
        "Sec-WebSocket-Version": "13", "Sec-WebSocket-Key": "dGhlIHNhbXBsZSBub25jZQ==",
      },
    });
    upgrade.setTimeout(10_000, () => upgrade.destroy(new Error("WebSocket upgrade timed out")));
    upgrade.on("upgrade", (response, socket) => {
      socket.destroy();
      response.statusCode === 101 ? resolve() : reject(new Error("WebSocket upgrade failed"));
    });
    upgrade.on("response", (response) => {
      response.resume(); reject(new Error(`WebSocket returned HTTP ${response.statusCode}`));
    });
    upgrade.on("error", reject);
    upgrade.end();
  });

  const trip = await fetch(`${base}/api/trips`, {
    method: "POST",
    headers: { ...headers, Cookie: cookie },
    body: JSON.stringify({ name: "Smoke Trip", startsOn: "2027-04-12", endsOn: "2027-04-13" }),
  });
  if (trip.status !== 201) throw new Error(`Ordinary Trip creation failed: ${trip.status}`);

  const logout = await fetch(`${base}/api/auth/logout`, { method: "POST", headers: { ...headers, Cookie: cookie } });
  if (logout.status !== 204) throw new Error(`Logout failed: ${logout.status}`);
  if ((await fetch(`${base}/api/auth/me`, { headers: { Cookie: cookie } })).status !== 401) throw new Error("Logged-out session is still usable");
  const login = await fetch(`${base}/api/auth/login`, {
    method: "POST", headers,
    body: JSON.stringify({ email: "container-smoke@example.com", password: "a sufficiently long password" }),
  });
  if (login.status !== 200 || !login.headers.get("set-cookie")) throw new Error("Login failed through web proxy");
  const crossSite = await fetch(`${base}/api/auth/logout`, {
    method: "POST", headers: { ...headers, "Sec-Fetch-Site": "cross-site", Cookie: cookie },
  });
  if (crossSite.status !== 403 || (await crossSite.json()).code !== "CSRF_PROTECTION_FAILED") throw new Error("Cross-site CSRF guard weakened");
}

check().catch((error) => { console.error(error); process.exitCode = 1; });
NODE

for _ in {1..60}; do
  if curl --fail --silent "http://127.0.0.1:${web_port}/" >/dev/null; then
    break
  fi
  sleep 1
done
curl --fail --silent "http://127.0.0.1:${web_port}/" >/dev/null
curl --fail --silent "http://127.0.0.1:${web_port}/health" >/dev/null

WEB_SMOKE_PORT="$web_port" node <<'NODE'
const response = await fetch(`http://127.0.0.1:${process.env.WEB_SMOKE_PORT}/`);
const policy = response.headers.get("content-security-policy") ?? "";
const connectSource = policy.split(";").find((directive) => directive.trim().startsWith("connect-src ")) ?? "";
if (!connectSource.split(/\s+/u).includes("http://127.0.0.1:4566")) {
  throw new Error("Web CSP does not contain the exact runtime S3 upload origin");
}
if (connectSource.includes("*") || connectSource.split(/\s+/u).includes("https:")) {
  throw new Error("Web CSP broadened the upload connection policy");
}
NODE

echo "Container smoke passed: migrate twice, API /health + /ready, web-proxied register/session/login/logout/Trip creation + WebSocket upgrade, cross-site CSRF rejection, web /health, and exact runtime S3 CSP (AI and OTEL disabled)."
