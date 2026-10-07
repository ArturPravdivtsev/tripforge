# Hosted demo: same-origin browser API

Post-v1 change: the existing v1.0.0 tag, release and artifacts are unchanged.

## Browser boundary

Browser HTTP and assistant SSE use relative `/api/...` URLs. The Next.js Node
route streams each request and response to the trusted runtime `API_ORIGIN`.
Socket.IO uses the same web origin at `/socket.io`, with WebSocket-only transport.
The existing Next.js Proxy rewrites that upgrade to the same upstream; an App
Router HTTP handler alone cannot handle a WebSocket upgrade.
The browser omits the trailing slash to avoid Next's HTTP-only redirect; the
rewrite restores `/socket.io/` for the Engine.IO upstream handshake.

The former direct browser call to a separate Render API host sent
`Sec-Fetch-Site: cross-site`. The API correctly rejected that mutation with
`CSRF_PROTECTION_FAILED`. The new browser request is
`https://tripforge-web.onrender.com/api/auth/register`, with Fetch Metadata
`same-origin`. No Render hostname is hardcoded in application source.

## Render configuration

On the **web** service set these server-runtime environment variables:

| Variable | Value |
| --- | --- |
| `API_ORIGIN` | The existing configured Render API origin, exactly `https://<your-api-service>.onrender.com`, without trailing slash/path/query/credentials |
| `WEB_ORIGIN` | `https://tripforge-web.onrender.com` |

Remove the obsolete `NEXT_PUBLIC_API_URL` web variable/build argument. The same
built web image can run with another upstream by changing runtime environment.
The optional browser MapTiler key remains a build input. Retain the exact
`S3_UPLOAD_ORIGIN` when browser uploads require a separate storage origin.

On the **API** service keep
`WEB_ORIGIN=https://tripforge-web.onrender.com`. No API auth, cookie, CORS or
Fetch Metadata configuration change is needed. Render must forward WebSocket
upgrades to the web Node service; its Next.js standalone server forwards them
to the configured API. Do not run a static export for this topology.

## Security and HTTP semantics

The upstream is read only from validated server environment. Neither a path,
query parameter nor forwarded header can select another host. API and web origins
must differ. Missing or malformed production configuration fails closed.
The web validates the incoming Host against `WEB_ORIGIN`. It preserves the
browser's actual Origin, Sec-Fetch-Site/Dest, mutation marker, Authorization
and Cookie; it never replaces invalid cross-site site/origin metadata with trusted
values. Node fetch generates `Sec-Fetch-Mode: cors` on the server upstream hop
(normal browser API fetches already use cors mode). The API guard does not trust
Mode/Dest to authorize mutations: exact Origin, mutation marker and Site still
control its unchanged policy. WebSocket upgrades preserve the original metadata.
The existing API guard and exact CORS policy remain authoritative. WebSocket
upgrades additionally require the exact trusted Origin at the web boundary.

HTTP strips hop-by-hop headers, including Connection-nominated fields, on both
directions. Client Forwarded/X-Forwarded values are discarded; trusted
X-Forwarded-Host/Proto are derived from `WEB_ORIGIN`, and upstream Host comes from
`API_ORIGIN`. A WebSocket handshake regenerates the necessary Connection/Upgrade
transport headers. Proxy requests follow no upstream redirects server-side.
Methods, pathname, query, body stream, content type, status, response stream and
relevant end-to-end headers survive. Fetch-decoded compression removes stale
Content-Encoding/Length. Multiple Set-Cookie headers stay separate and unchanged.

Host-only HttpOnly cookies are stored for the web origin, then forwarded by the
web server to the API for HTTP and Socket.IO. Production retains `__Host-`,
Secure, Path=/ and SameSite=Lax. No token is exposed to JavaScript or moved into
browser storage. CSP needs only `self` for HTTP/SSE/WebSocket; exact MapTiler and
optional S3 origins remain. API-wide CORS is not broadened.

The API's existing address-based rate limits observe the web proxy connection.
Do not enable arbitrary trust-proxy/IP forwarding to bypass that limit; review
capacity/rate-limit behavior before promoting a shared public demo to production.

## Hosted-demo Documents storage: Supabase S3

As of 2026-10-07, the operator reports hosted same-origin register, session,
reload, logout/login and realtime qualification PASS. The operator also confirms
live Render + Supabase storage upload/read qualification PASS, as recorded below.
Physical object deletion remains **NOT QUALIFIED** because the current Render
deployment does not run the storage-cleanup worker.

Supabase Storage is used only for hosted-demo object storage through its
S3-compatible API. The existing AWS SDK and provider-neutral Documents contracts
remain authoritative. Local development remains LocalStack; AWS production
remains native Amazon S3 with IAM roles and unchanged Terraform defaults.
No Supabase Auth, database integration or client SDK is involved.

Keep the `tripforge-demo-documents` bucket **private**. Enable the project's S3
connection and use generated server S3 credentials, not an anon/service-role JWT.
Those credentials bypass Supabase Storage RLS; TripForge authentication, Trip
membership, RBAC, scope and metadata validation authorize every capability.
Do not create RLS policies for this server credential flow or make the bucket public.
See [Supabase S3 authentication](https://supabase.com/docs/guides/storage/s3/authentication).

### Render API configuration

Set the following runtime values on `tripforge-api`, not on the web service or
a shared web/API environment group. Never put secret values in Docker build args,
source, diagnostics or `NEXT_PUBLIC_*` variables.

| Existing variable | Classification | Value |
| --- | --- | --- |
| `S3_BUCKET` | Non-secret | `tripforge-demo-documents` |
| `S3_REGION` | Non-secret | `eu-west-2` |
| `S3_ENDPOINT` | Non-secret | `https://escgigaitmycmhkcsjny.storage.supabase.co/storage/v1/s3` |
| `S3_FORCE_PATH_STYLE` | Non-secret | `true` |
| `AWS_ACCESS_KEY_ID` | Secret | Supply the generated Supabase S3 credential only in Render API environment |
| `AWS_SECRET_ACCESS_KEY` | Secret | Supply the generated Supabase S3 credential only in Render API environment |
| `AWS_REQUEST_CHECKSUM_CALCULATION` | Non-secret, standard AWS SDK setting | `WHEN_REQUIRED` |
| `AWS_RESPONSE_CHECKSUM_VALIDATION` | Non-secret, standard AWS SDK setting | `WHEN_REQUIRED` |

Leave `S3_PUBLIC_ENDPOINT` unset (or empty): the signing client falls back to
`S3_ENDPOINT`. Do not retain a LocalStack public endpoint. Leave
`AWS_SESSION_TOKEN` unset for generated S3 key credentials. The existing SDK
credential-provider chain consumes the two AWS credential variables; no new
TripForge aliases or credential-returning endpoint is needed.

The two standard checksum settings are read directly by AWS SDK v3. Offline
presigning with SDK defaults adds an empty-body CRC32 to PUT and checksum-mode
to GET. `WHEN_REQUIRED` omits these optional parameters for the direct-browser
flow, whose payload is not available to the API at signing time. These settings
apply only to the hosted-demo service; do not change native AWS or LocalStack
defaults. See [AWS checksum settings](https://docs.aws.amazon.com/sdkref/latest/guide/feature-dataintegrity.html).

### Render Web CSP and request flow

On `tripforge-web` set the non-secret runtime value:

```dotenv
S3_UPLOAD_ORIGIN=https://escgigaitmycmhkcsjny.storage.supabase.co
```

This exact origin was verified from a real AWS SDK-generated, path-style
presigned URL using synthetic credentials and the configured endpoint. It is not
the endpoint path: do not include `/storage/v1/s3`, a trailing slash, credentials,
query or wildcard. Existing `connect-src` adds exactly this origin. The web
receives no S3 credentials, and this variable is not a web build input.

The browser requests a capability through the existing same-origin `/api` flow,
then PUTs bytes directly to storage with the API-returned `Content-Type` header.
The upload is raw file bytes, not multipart/form-data; do not add API cookies,
Authorization, `apikey` or `X-TripForge-Request` to the storage request. Keep the
entire presigned query intact. PUT expires in 600 seconds; authorized GET expires
in 300 seconds and retains the sanitized attachment filename.

Current AWS SDK SignedHeaders contains `host`, not `content-type`. The API sets
the upload content type, and mandatory HEAD verification checks exact MIME and
size before a pending document can become ready. Allowed types remain PDF,
JPEG, PNG and WebP; size remains 1 byte through 25 MiB. The existing PUT capability
does not itself enforce a maximum upload size; configure an appropriate private
bucket limit separately if desired, without removing TripForge's validation.

SigV4 necessarily includes the access-key identifier and credential scope in
`X-Amz-Credential`, plus a temporary signature; it never includes the secret key
or a reusable credentials object. This is not exposure of the secret signing key.
Treat the entire URL as a bearer capability: never log it, paste it into reports,
persist it or include it in analytics/HAR exports without redaction.

Supabase does not support S3 `PutBucketCors`/`GetBucketCors` or object versioning.
Do not run LocalStack/AWS bucket initialization scripts against this endpoint.
The browser's OPTIONS must permit the web origin, PUT and Content-Type; progress
events may require preflight even for an otherwise simple content type. Do not
add speculative CSP/CORS wildcards or proxy file bytes. Live Supabase upload,
download and browser CORS were initially **PENDING EXTERNAL** at local
qualification; that blocker is now resolved by the operator-confirmed hosted
run below. Local signing alone was not evidence of a live provider PASS.
See [Supabase S3 compatibility](https://supabase.com/docs/guides/storage/s3/compatibility).

### Deletion prerequisite and hosted limitations

Deletion is DB-first: API removes metadata and records a durable cleanup intent;
the existing worker performs HEAD-independent, idempotent `DeleteObject` and
completes the intent. Supabase deletion is permanent; no version recovery is
available. A worker failure can leave a private object awaiting cleanup even
after it disappears from TripForge's UI.

The operator confirms that the current Render deployment does **not** run the
TripForge worker responsible for storage cleanup. Physical object deletion is
therefore **NOT QUALIFIED**: private object bytes may remain after metadata
removal, and absence from the UI does not prove storage deletion. The existing
DB-first, worker-driven cleanup architecture remains unchanged; cleanup is not
moved into the API and no free-hosting-specific workaround is introduced.
Any worker deployment or secret distribution changes require separate approval.
Do not claim physical deletion verified until the worker processes the cleanup
intent and object absence is confirmed.

Render Free cold starts remain a known hosted-demo limitation; an initial API
request may wait for startup. This does not change storage authorization or justify
publishing the bucket. See [Render Free limitations](https://render.com/docs/free).

### Local storage configuration qualification (2026-10-07)

Only tests and documentation changed; product code, SDK versions, Documents
contracts, Compose, Terraform and Dockerfiles are unchanged. Lint, typecheck,
unit tests (615), integration tests (98), `check`, `check:full`, `security:audit`,
`test:security`, `docs:check`, `release:check` and whitespace checks passed.
Existing native AWS and split LocalStack configurations remain valid.

The standard container smoke passed using application-code-equivalent images.
Additional production-image checks exercised actual storage module factories,
PUT/GET signing with synthetic credentials, offline HEAD/DELETE serialization,
and runtime web CSP for the exact Supabase origin. This local run did not exercise
live Supabase operations or hosted browser CORS; no new audit exception was added.
The subsequent hosted evidence is recorded separately below.

### Hosted storage qualification (2026-10-07)

The operator confirms the following live results on
`https://tripforge-web.onrender.com` with storage qualification commit
`ba8c682d58168389275dd3bebc4d47bd8efde5c1`
(`test: qualify S3-compatible hosted storage`). These are operator-provided
hosted results, not a rerun of the local checks or a new deployment.

The verified bucket is private `tripforge-demo-documents`, with endpoint
`https://escgigaitmycmhkcsjny.storage.supabase.co/storage/v1/s3`, region
`eu-west-2` and `forcePathStyle=true`.

| Live evidence | Result |
| --- | --- |
| Direct browser presigned PUT | PASS |
| Browser CORS | PASS |
| HEAD verification and finalization | PASS |
| Document reaches `ready` state | PASS |
| Document remains after reload | PASS |
| Presigned GET/download | PASS |
| S3 secret key/reusable credentials not exposed to browser | PASS; SigV4 identifier caveat above still applies |
| Exact `S3_UPLOAD_ORIGIN` CSP configuration | PASS: `https://escgigaitmycmhkcsjny.storage.supabase.co` |

This closes hosted upload/read, browser CORS and exact-origin CSP qualification.
Physical object deletion is **NOT QUALIFIED** because the current Render
deployment does not run the cleanup worker; it is excluded from this PASS.

### Manual hosted Documents regression checklist

Use disposable accounts, a disposable Trip and a small allowed file after the
configuration and any deployment are separately authorized. Retain this checklist
for regression checks; the evidence above does not establish additional live RBAC
results or deletion qualification. Physical deletion checks require a running
cleanup worker, which the current Render deployment lacks:

1. Login through the web origin.
2. Open or create the disposable Trip as owner/editor.
3. Upload a document and inspect the same-origin upload-intent request.
4. Verify direct storage PUT succeeds with the returned Content-Type and intact
   signed query. Inspect OPTIONS if present; verify required origin/method/header
   allowances. On failure record status and CORS header names/values only, with
   signed URL, signature and credential identifier redacted.
5. Verify completion/HEAD succeeds and the ready document appears in the UI.
6. Reload the workspace.
7. Verify the document remains listed.
8. Download through an authorized API capability and verify file bytes/name.
9. Inspect requests: API metadata through web `/api`, file bytes directly to the
   exact storage origin; no API cookies or credentials object sent to storage.
10. Verify no secret key, reusable credential object or S3 credentials in public
    configuration/bundles/logs. The SigV4 key identifier is the documented exception.
11. Verify an outsider cannot presign/read another Trip's document; viewer may
    download ready files but cannot upload or delete. Unauthenticated requests fail.
12. Delete the disposable document as owner/editor.
13. Wait for worker completion; confirm the object is absent in the private bucket
    or via authorized HEAD, not merely absent from the UI.
14. Reload and confirm deletion persists. Do not claim this step passed if cleanup
    is still awaiting a worker.

## Local configuration and verification

Native development defaults to web `http://127.0.0.1:3000` and API
`http://127.0.0.1:4000`; see the web environment example. Compose uses runtime
`API_ORIGIN=http://api:4000` and the host-visible web origin. The disposable
readiness/E2E stack uses web 3310 and upstream API 4410, with browser fixtures
calling the web. Health/readiness probes may still address the API directly.

After deploying this post-v1 commit, use a disposable demo account to verify
register, logout, login, authenticated reload, and live realtime. Inspect the
registration request URL and `Sec-Fetch-Site`; confirm the cookie is HttpOnly and
Secure on the web host, and confirm an invalid direct cross-site API mutation
still receives `CSRF_PROTECTION_FAILED`. Local qualification does not establish
that the hosted Render service has already deployed or passed this check.

## Local qualification (2026-10-06)

Lint, typecheck, `test` (607 tests), `check`, `check:full` (98 integration tests),
`release:check`, documentation and workflow policy checks passed. All 12 Chromium
qualification scenarios passed, including same-origin registration/auth reload,
HttpOnly isolation, assistant SSE and two-user realtime/RBAC/live revocation.
Web/API/migrate Docker builds and container smoke passed, including web-proxied
auth, an actual WebSocket upgrade and rejection of cross-site mutation metadata.

At proxy commit `91eea0f4bb379150d5a5c06ad91e0a0a413156ac`, `security:audit`
failed for the newly reviewed HIGH advisory
[GHSA-wq5f-xc86-pv6w](https://github.com/advisories/GHSA-wq5f-xc86-pv6w)
in transitive `sharp@0.35.4`. The follow-up security closure resolves this blocker
with a lockfile-only update to `sharp@0.35.5` and its matching native packages
(`@img/sharp-libvips-*` version `1.3.4`). The only chain is the web production
dependency `next@16.3.6` -> optional runtime dependency `sharp`; Next's existing
`^0.35.4` range admits the patch. No manifest, override, parent-package upgrade
or audit exception is needed. Sharp is loaded by Next's production image optimizer,
not merely by development tooling.

With the patched lockfile, `security:audit`, `test:security`, lint, typecheck,
`test` (607 tests), `check`, `check:full` (98 integration tests), `release:check`
and `docs:check` pass. The installed dependency tree contains only `sharp@0.35.5`;
the advisory is absent from the fresh npm audit.
Web/API/migrate images were rebuilt and the standard container smoke passed.
The web image loads `sharp@0.35.5` and processes SVG to PNG successfully. Fresh
Trivy scans pass the unchanged CI HIGH/CRITICAL, fixable-vulnerability gate for
all three images, with no sharp findings or secret findings. The raw reports still
contain existing unfixed Debian HIGH findings; this does not claim zero OS CVEs.

These are local results, not post-v1 hosted qualification. At the time of this
local run, Render deployment and hosted auth/realtime verification were pending
external actions; see the later hosted-storage section for operator-reported status.
The published
`v1.0.0` tag and GitHub Release are unchanged.
