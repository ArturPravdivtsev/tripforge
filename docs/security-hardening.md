# Security hardening

TripForge security hardening is informed by OWASP ASVS 5.0.0 and prioritizes
applicable Level 1 and Level 2 controls. This is a practical engineering review,
not a claim of formal ASVS compliance or certification.

## Scope and threat assumptions

This review covers the Nest API, Next browser application, opaque sessions,
PostgreSQL authorization, Socket.IO, Redis, BullMQ, and private S3-compatible
documents. It assumes an attacker may control a browser origin, submit malformed
requests and guessed UUIDs, spray credentials across API nodes, spam socket
events, and learn any value intentionally shipped in a browser bundle. It does
not assume a compromised production host, database administrator, cloud account,
or dependency publisher can be contained by application controls alone.

The existing architecture remains authoritative: opaque server-side sessions,
HttpOnly cookies, database-backed Trip RBAC, scoped `404` behavior, REST-only
mutations, Socket.IO invalidations, private direct-to-S3 uploads, a transactional
outbox, and PostgreSQL business truth.

## Defense-in-depth baseline

- Authentication proves an account session. It does not grant access to a Trip.
- Trip authorization resolves the current owner/member role from PostgreSQL.
- Resource ownership is independently proven with `trip_id + resource_id`
  scoped lookups. A socket room and an unpredictable UUID are never authority.
- Unknown users and wrong passwords return the same public login error and both
  perform Argon2 verification work.
- All authenticated API responses use `Cache-Control: private, no-store` and
  `Pragma: no-cache`, including auth, search, notifications, and presigned URL
  responses.
- Validation transforms known DTO fields and rejects unknown ones. JSON bodies
  are capped at 256 KiB; file bytes bypass Nest and go directly to S3.
- Unexpected exceptions use a generic stable response. Stack traces, database,
  Redis, provider, storage, and environment details stay server-side.

## Authentication and sessions

Passwords use Argon2id with 19,456 KiB memory, 2 iterations, and parallelism 1.
The accepted password length is 15–128 characters with no arbitrary composition
rules. A successful login checks whether the stored hash needs the current
policy and conditionally rehashes it; users are not forced through a password
reset. Duplicate registration still returns a distinct `409` for useful MVP UX,
which is an accepted account-enumeration risk.

Each login or registration creates a fresh 32-byte cryptographically random
opaque token. PostgreSQL stores only its SHA-256 digest. Absolute expiry is not
extended by realtime activity. Production uses
`__Host-tripforge_session; Secure; HttpOnly; SameSite=Lax; Path=/` with no
`Domain`; local HTTP uses a separate non-Secure `tripforge_session` cookie.
Logout deletes the row, clears the cookie, and disconnects the session room
across API nodes. Expired sessions fail both HTTP and later Socket.IO handshakes.

## CSRF and browser request boundary

CORS is not CSRF protection. TripForge layers:

1. `SameSite=Lax` on the session cookie;
2. one exact credentialed `WEB_ORIGIN` CORS allowlist;
3. `X-TripForge-Request: 1` on every unsafe method;
4. exact `Origin === WEB_ORIGIN` validation for browser mutations;
5. rejection of `Sec-Fetch-Site: cross-site` as defense in depth;
6. JSON-only body-bearing mutations and no state-changing GET/HEAD/OPTIONS.

Fetch Metadata is not mandatory for non-browser/test clients. Exact Origin and
the custom header remain the compatible fallback. CORS preflight is not subject
to mutation-header enforcement. Direct API operation uses the socket peer IP;
`X-Forwarded-For` is not trusted until Stage 29 defines proxy hops.

## Distributed rate limits

`RedisThrottlerStorage` uses the existing Redis service and an atomic Lua
increment/expiry/block operation. Tracker material is SHA-256-derived before it
enters a Redis key. All API instances share counters, restarts do not create an
in-memory bypass, and IPv6 clients are grouped by `/64`.

| Endpoint class | Tracker | Limit/window | Block | Redis failure | Reason |
| --- | --- | --- | --- | --- | --- |
| Login | peer IP | 20 / 5 min | 5 min | fail closed `503` | spraying from one source |
| Login | normalized email | 10 / 15 min | 15 min | fail closed `503` | distributed credential stuffing |
| Register | peer IP | 5 / 15 min | 15 min | fail closed `503` | account-creation floods |
| Route create/recalculate | user ID | 10 / min | 1 min | fail closed for operation | protect ORS quota |
| Trip search | user ID | 60 / min | 1 min | fail closed for operation | bound expensive search |
| Upload intent | user ID | 20 / hour | 5 min | fail closed for operation | bound S3 capabilities |
| Download URL | user ID | 60 / hour | 1 min | fail closed for operation | bound URL minting |
| Socket `trip:join` | user ID | 20 / min | 1 min | fail closed for join | room-enumeration/spam |
| Socket `trip:leave` | user ID | 60 / min | 1 min | fail open for cleanup | never trap a client in a room |

The login IP and account buckets are independent and both must allow a request.
The account tracker uses the same trim/lowercase normalization as login. Public
`429` responses do not reveal which bucket fired or remaining guesses; only a
coarse `Retry-After` is returned. Redis is not consulted by ordinary reads, so a
limiter outage does not make `/auth/me` or normal low-risk reads unavailable.
Production configuration cannot disable the limiter.

## HTTP, WebSocket, and response hardening

Helmet runs before routes. API CSP is intentionally disabled because the API
serves JSON; applicable protections include `nosniff`, a deliberate referrer
policy, removal of `X-Powered-By`, and production-only HSTS with
`max-age=31536000` but no preload or subdomain promise. TRACE and CONNECT return
a clean `405`. Health returns only `{"status":"ok"}`.

Socket.IO accepts only the exact web Origin, authenticates only the HttpOnly
cookie, never accepts a token in a URL or auth payload, and caps frames at 64
KiB. Client `trip:join`/`trip:leave` events are rate-limited; server invalidation,
presence, and notification events are not. Every join performs a fresh database
permission check and REST remains the mutation authority.

## Web Content Security Policy

The enforced CSP is generated per request in `proxy.ts` with a random 128-bit
nonce. Next receives that nonce through request headers and the browser receives
the same policy in the response. This avoids production `unsafe-inline` scripts
and `unsafe-eval`; development alone permits `unsafe-eval` for tooling. The
security tradeoff is explicit: reading request headers makes the root layout
dynamic, so static optimization is sacrificed for nonce-backed Next bootstrap.

| Directive | Policy and reason |
| --- | --- |
| `default-src` | `'self'` fallback |
| `script-src` | self + request nonce + `strict-dynamic`; dev-only `unsafe-eval` |
| `style-src` | self + `unsafe-inline` for React/MapLibre style attributes; scripts stay nonce-protected |
| `img-src` | self, data/blob, exact MapTiler API origin |
| `font-src` | self, data, exact MapTiler API origin |
| `connect-src` | self, exact API HTTP/WebSocket origins, MapTiler, optional exact S3 upload origin |
| `worker-src` | self + blob for MapLibre workers |
| `object-src` | none |
| `base-uri` / `form-action` | self |
| `frame-ancestors` / `frame-src` | none |

There are no `*`, broad `https:` or broad `wss:` sources. Downloads navigate to
a short S3 URL and do not need `connect-src`; browser PUT uploads do, so their
configured exact origin is included. Static web headers also set `nosniff`,
`strict-origin-when-cross-origin`, `X-Frame-Options: DENY`, COOP, and a
Permissions Policy disabling unused camera, microphone, payment, USB,
Bluetooth, and Topics capabilities. Geolocation remains available. HSTS is
production-only and makes no preload/subdomain commitment.

## Input, injection, navigation, and outbound requests

The global validation pipe retains transform, whitelist, and
forbid-non-whitelisted behavior. DTOs bound strings, enums, numbers, UUIDs, and
nested objects; search retains `q <= 100` and `limit <= 50`. Representative
prototype-pollution, hostile SQL/tsquery, body-size, malformed JSON, and object
substitution cases are tested. SQL remains parameterized through Drizzle.

Product code has no `dangerouslySetInnerHTML` or user-controlled `innerHTML`.
React renders text escaped. Typed notification/search targets resolve only to
internal routes; login has no arbitrary `next` redirect. The one external
document navigation uses a server-authorized presigned URL. Server-side network
requests use only configured ORS/S3 endpoints. Clients choose an allowlisted
route mode, never an upstream URL or S3 key, so no public SSRF primitive was
found.

## Documents and object storage

The bucket is private. Server-generated UUID keys, a PDF/JPEG/PNG/WebP allowlist,
25 MiB limit, S3 HEAD verification, signed exact content type, and 10-minute
upload / 5-minute download capabilities remain. Each URL grants one operation on
one object. Download authorization is rechecked against current Trip access.
Filenames are bounded display metadata and sanitized for quotes, CR/LF,
semicolons, Unicode, and path separators before `Content-Disposition`.
MIME validation is not malware scanning. A URL already issued before revocation
may work until its short expiry.

## Authorization review

Nested members, destinations, days, itinerary, routes, reservations, expenses,
documents, and search retain parent-Trip authorization and scoped resource
queries. Foreign and nonexistent resources share the established `404` where
anti-enumeration applies. Viewers receive `403` for mutations after readable
Trip scope is established. Trip deletion and member administration stay
owner-only. Removed members are re-evaluated from PostgreSQL, not stale sessions,
sockets, or browser state. Notifications are scoped by notification ID plus the
authenticated user ID; search authorizes the parent Trip before querying any
source table.

## Secrets, logs, and environment

| Variable | Classification | Policy |
| --- | --- | --- |
| `DATABASE_URL` | secret | server only; mandatory in production |
| `REDIS_URL` | secret when credentialed | server/worker only; never logged |
| `OPENROUTESERVICE_API_KEY` | server secret | optional capability; no fabricated fallback |
| AWS access/secret/session credentials | server secret | injected runtime/test values; never browser-visible |
| `LOCALSTACK_AUTH_TOKEN` | local/CI secret | uncommitted runtime value |
| `NEXT_PUBLIC_MAPTILER_KEY` | browser-visible public API key | origin-restricted, quota-limited, rotatable |
| `NEXT_PUBLIC_API_URL` | public configuration | exact origin, embedded in web build |
| `NEXT_PUBLIC_S3_UPLOAD_ORIGIN` | public configuration | exact upload origin for CSP |

Repository `.env` variants and credentials remain ignored; examples contain
only local values/placeholders. The secret scan covers tracked/unignored text
for AWS key shapes, private PEM blocks, raw session-like constants, and provider
keys. It is a focused regression guard, not proof that no secret exists.
Current logs were reviewed for passwords, cookies, session tokens, hashes,
signed URLs, object keys, provider keys, raw search queries, and credentialed
Redis URLs; none are intentionally emitted. Production browser output is also
scanned for server-only environment names.

## Dependency and supply-chain status

The security runtime additions are `@nestjs/throttler@6.7.1` and
`helmet@8.3.0`. The 2026-10-01 audit fixed a critical Next ImageResponse
advisory by updating Next and its matching tooling from 16.3.4 to 16.3.6. It
also fixed high/moderate Multer DoS findings with 2.4.0 and patched transitive
`brace-expansion`, `@grpc/grpc-js`, and `fast-uri` versions through narrow pnpm
workspace overrides. `pnpm security:audit` now reports no known production
vulnerabilities and fails on future high/critical findings.

The full development audit has one accepted moderate advisory:
`esbuild@0.18.20` (`GHSA-67mh-4wv8-2f99`) is reachable only through the
development-only Drizzle Kit / deprecated esbuild-kit loader. TripForge does not
start esbuild's development server through this path, so the cross-origin dev
server issue is not runtime-reachable. Replacing the loader requires an upstream
Drizzle tooling update; review again by 2026-11-01. Frozen lockfile installation
and pnpm's install-script allowlist remain required supply-chain gates.

## ASVS-informed mapping

| ASVS 5.0.0 area | Implemented evidence |
| --- | --- |
| Authentication | Argon2id policy, generic failures, dummy verification, rehash-on-login, distributed throttles |
| Session management | random opaque tokens, hash-at-rest, host-prefixed cookie, expiry and logout revocation |
| Access control | fresh Trip RBAC, owner-only operations, scoped IDs and anti-enumerating 404s |
| Validation and encoding | strict DTOs, bounded JSON, parameterized SQL, React escaping, safe filenames |
| Web frontend security | nonce CSP, clickjacking/referrer/permissions headers, no browser token storage |
| API and WebSocket security | exact Origin/CORS, CSRF header, Fetch Metadata, frame/event limits |
| File handling | private bucket, allowlist/size/HEAD checks, short scoped presigned URLs |
| Configuration and operations | production fail-fast, local secret/audit gates, minimal health/errors/logging |

## Verified attack and bypass regressions

Automated coverage includes shared limits across two API instances, concurrent
Redis atomicity and expiry, brute-force `429`, Redis-unavailable auth fail-closed,
equivalent unknown/wrong-password responses, evil-Origin requests with a valid
session, missing mutation header, cross-site Fetch Metadata, safe GET access,
prototype-pollution keys, oversized/malformed JSON, CSP directive semantics,
security/cookie/cache headers, socket rate and payload configuration, hostile
search strings, cross-Trip ID substitution, notification/document isolation,
and Content-Disposition injection. Existing domain integration suites remain the
authorization matrix for owner, editor, viewer, outsider, and removed member.

## Known limitations and future controls

- MFA and password recovery are absent; Stage 26 does not add email delivery.
- There is no malware scanner, formal penetration test, production WAF, or CSP
  report collector.
- Stage 27 owns structured security event observability and alerting.
- Stage 29 owns TLS 1.2+ (prefer 1.3), load-balancer trust/proxy policy, private
  database networking, cloud storage encryption/IAM, WAF, and secret manager.
- Production CSP runtime still needs real-browser verification across Next,
  Socket.IO, MapLibre/MapTiler, and direct S3 upload/download.
- LocalStack community tests cannot claim production IAM enforcement, and the
  pinned Compose image requires an external auth token.
- Client source-map publication remains a deployment decision; Next production
  defaults are not intentionally overridden. Server secrets must never be put
  into `NEXT_PUBLIC_*` variables regardless of source-map policy.

## Reusable pre-release checklist

- Run frozen install, `pnpm security:audit`, `pnpm security:secrets`,
  `pnpm test:security`, integration, accessibility, performance, and build gates.
- Confirm no accepted high/critical production advisory or undocumented audit
  exception; review dev-only findings separately.
- Verify production secrets/config are injected, examples are placeholders, and
  server-only names/values are absent from browser chunks and logs.
- Inspect CSP, `nosniff`, referrer, clickjacking, permissions, cache, and HSTS
  headers on production-like HTTPS responses.
- Inspect `__Host-tripforge_session`: Secure, HttpOnly, SameSite=Lax, Path=/, no
  Domain; verify it is absent from JavaScript-visible storage.
- Exercise exact CORS, evil Origin, missing mutation header, cross-site Fetch
  Metadata, and no state-changing safe methods.
- Alternate auth attempts across two API nodes and confirm the shared limit;
  test Redis-unavailable fail-closed authentication.
- Re-run owner/editor/viewer/outsider/removed-member RBAC and representative
  foreign-resource IDOR cases.
- Confirm logs contain no cookies, tokens, credentials, raw private queries,
  object keys, or signed URLs.
- Verify MIME/size/HEAD checks, private bucket policy, short capabilities, safe
  filenames, and document access after membership removal.
- Verify wrong-Origin sockets fail, oversized events disconnect, spam throttles,
  logout disconnects all nodes, and reconnect reauthorizes from PostgreSQL.

## Manual browser QA

In a production-like browser, verify application boot, login throttling and its
accessible error, cross-tab logout, Back after logout, socket reconnect, MapLibre
tiles/controls, direct S3 PUT and download, and no unexpected CSP console errors.
Inspect cookies, response headers, network destinations, local/session storage,
IndexedDB, and browser-visible source/config. Browser extensions' own violations
must be distinguished from product CSP violations.
