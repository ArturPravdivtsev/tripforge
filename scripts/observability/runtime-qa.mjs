import { randomUUID } from "node:crypto";

const apiUrl = process.env.TRIPFORGE_API_URL ?? "http://127.0.0.1:4000";
const origin = process.env.TRIPFORGE_WEB_ORIGIN ?? "http://127.0.0.1:3100";
const runId = `${Date.now()}-${randomUUID().slice(0, 8)}`;
const account = {
  displayName: "Observability QA",
  email: `observability-${runId}@example.test`,
  password: `${randomUUID()}-${randomUUID()}`,
};
let cookie = "";
const requestIds = [];

const register = await request("POST", "/api/auth/register", account);
cookie = responseCookie(register.response);
await request("POST", "/api/auth/logout");
cookie = "";
const login = await request("POST", "/api/auth/login", {
  email: account.email,
  password: account.password,
});
cookie = responseCookie(login.response);

const created = await request("POST", "/api/trips", {
  endsOn: "2027-05-05",
  name: `Observability QA ${runId}`,
  startsOn: "2027-05-01",
});
const tripId = created.body.id;
if (typeof tripId !== "string") throw new Error("Trip ID missing");

await request("GET", `/api/trips/${tripId}`);
await request("GET", `/api/trips/${tripId}/expenses`);
await request(
  "GET",
  `/api/trips/${tripId}/search?q=my-secret-trip-plan&limit=20`,
);
await request("DELETE", `/api/trips/${tripId}`);

const rejectedStatuses = [];
for (let attempt = 0; attempt < 12; attempt += 1) {
  const response = await fetch(`${apiUrl}/api/auth/login`, {
    body: JSON.stringify({
      email: account.email,
      password: `${randomUUID()}-${randomUUID()}`,
    }),
    headers: mutationHeaders(true),
    method: "POST",
  });
  rejectedStatuses.push(response.status);
}
if (!rejectedStatuses.includes(429)) {
  throw new Error(`Expected a 429, got ${rejectedStatuses.join(",")}`);
}

process.stdout.write(
  `${JSON.stringify({
    operations: [
      "register",
      "logout",
      "login",
      "trip.create",
      "trip.read",
      "expense.list",
      "search",
      "trip.delete",
      "rate_limit",
    ],
    rateLimitStatuses: rejectedStatuses,
    requestIds: requestIds,
    status: "ok",
  })}\n`,
);

async function request(method, path, body) {
  const response = await fetch(`${apiUrl}${path}`, {
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    headers: mutationHeaders(body !== undefined),
    method,
  });
  const requestId = response.headers.get("x-request-id");
  if (!requestId) throw new Error(`${method} ${path} omitted X-Request-ID`);
  requestIds.push(requestId);
  const text = await response.text();
  const parsed = text ? JSON.parse(text) : undefined;
  if (!response.ok) {
    throw new Error(`${method} ${path} failed with ${response.status}`);
  }
  return { body: parsed, response };
}

function mutationHeaders(hasBody) {
  return {
    ...(cookie ? { Cookie: cookie } : {}),
    ...(hasBody ? { "Content-Type": "application/json" } : {}),
    Origin: origin,
    "X-Request-ID": randomUUID(),
    "X-TripForge-Request": "1",
  };
}

function responseCookie(response) {
  const value = response.headers.getSetCookie()[0]?.split(";", 1)[0];
  if (!value) throw new Error("Session cookie missing");
  return value;
}
