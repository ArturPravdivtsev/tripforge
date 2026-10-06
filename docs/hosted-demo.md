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

`security:audit` remains **FAIL** for the newly reviewed HIGH advisory
[GHSA-wq5f-xc86-pv6w](https://github.com/advisories/GHSA-wq5f-xc86-pv6w)
in the existing transitive `sharp@0.35.4` (fixed in `0.35.5`). This proxy change
does not update dependencies or add a security exception. Full hosted/security
qualification is not claimed. Render deployment and hosted auth/realtime
verification remain pending external actions.
