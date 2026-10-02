# Testing strategy

TripForge follows a testing pyramid: most checks should be fast unit and
component tests, with progressively fewer integration and browser tests.

```text
             Browser E2E
               few tests
                  /\
                 /  \
          HTTP / Integration
                 tests
               /      \
              /        \
        Unit / Component
             many tests
```

## Testing layers

- **Unit tests:** pure domain logic, services, helpers, and isolated controllers.
- **Component tests:** React components and user interactions without a real
  browser or backend.
- **Integration/API tests:** Nest modules, routing, validation, and persistence
  boundaries. Authentication runs against ephemeral PostgreSQL 18.6 through
  Testcontainers and applies the real committed Drizzle migrations. Trips
  coverage exercises CRUD, pagination, timestamps, browser mutation policy,
  and cross-user ownership against the same PostgreSQL image.
- **Browser E2E tests:** critical user journeys only. They are not implemented yet.

Trip search adds a dedicated real-PostgreSQL integration suite. It applies the
committed migration and checks extension/index catalogs, generated-column
updates, all allowed fields, typo and full-text paths, ranking and stable order,
filters/limits, ready-document publication, RBAC and cross-Trip isolation,
hostile query text, and an index-aware `EXPLAIN`. Focused component tests cover
debounce, cancellation wiring, filters, accessible results, typed navigation,
query keys, and realtime invalidation mapping.

Stage 8 covers browser authentication with React Testing Library component
tests, mocked Fetch client tests, Nest CORS/browser-policy HTTP tests, real
PostgreSQL authentication integration tests, and manual browser QA. Installing
Playwright remains intentionally deferred.

Stage 10 adds fresh-`QueryClient` component tests for Trips loading, empty,
authentication-required and retryable-error states; URL pagination and retained
page data; create/edit forms; optimistic deletion success and rollback; and
logout cache isolation. Focused client tests cover request URLs, credentials,
mutation headers, JSON bodies, `AbortSignal`, and `204 No Content` handling.

Stage 12 adds pure calendar/reconciliation, destination ordering, permission,
and DTO tests; workspace/destination/Day component tests; nested Fetch client and
cache-isolation regressions; and real PostgreSQL tests for atomic reconciliation,
stable IDs, role enforcement, reorder rollback, same-Trip composite foreign keys,
checks, cascades, and destination deletion. A focused migration test applies
Stages 1–11, inserts pre-existing dated and partial Trips, applies Stage 12, and
verifies inclusive backfill without changing Trip timestamps.

Stage 13 adds strict wall-clock/DTO and service tests; pure same-Day/cross-Day
ordering helpers; item form, role, handle, cache-isolation, API-client, and full
optimistic rollback component coverage. PostgreSQL integration tests exercise
item CRUD/RBAC/scoping, deterministic listing, complete-list reorder, cross-Day
moves, deletion normalization, forced transactional rollback, date conflicts,
checks, foreign keys, duplicate positions, and Day/Trip cascades.

Stage 14 adds pure bounds and coordinate validation tests, mocked map-boundary
component tests, destination location preview/save/cancel/clear coverage, API
body checks, and PostgreSQL integration coverage for coordinate persistence,
name-only PATCH preservation, RBAC, and every pair/range CHECK. Automated tests
never contact MapTiler and do not require WebGL or internet access.

Stage 15 adds nested place DTO/service and PostgreSQL CRUD/RBAC/reorder/CHECK
coverage; mocked MapTiler request, runtime-schema, normalization, error, and
`AbortSignal` tests; controlled-timer debounce coverage; RTL combobox keyboard,
selection, failure, form-autofill/remove/cancel tests; and pure/map-boundary
tests for both point categories, popups, bounds, selection, and reorder-stable
coordinates. Automated tests never call the real geocoding service.

Stage 16 adds mocked ORS endpoint/profile/auth/order/timeout/response/error tests;
route service and formatting tests; RTL owner/editor/viewer route UX; GeoJSON
source/style/bounds/selection tests; and PostgreSQL coverage for CRUD/RBAC,
directional uniqueness, checks, cascades, coordinate invalidation, metadata and
reorder preservation. A deferred mock provider response proves that coordinates
changed during external I/O produce `ROUTE_ENDPOINT_CHANGED` and no stale row.
Automated tests never consume live ORS quota or require external network.

Stage 17 adds fast DTO/service normalization, local schedule, merged PATCH,
conditional subtype, and RBAC tests. PostgreSQL integration covers common and
transport persistence, deterministic ordering, atomic kind switches, invalid
result rollback, scoped itinerary links, `SET NULL`, Trip/subtype cascades, and
direct enum/FK/CHECK enforcement. RTL covers list states, viewer mode,
cancelled/outside-range presentation, local-only cancellation copy, delete
confirmation/failure, conditional transport fields, create/edit hydration,
kind switching, optional links, refetch-safe edits, API URLs, and logout cache
isolation. No test contacts a booking provider because Stage 17 stores manual
structured data only.

Stage 18 adds pure currency-exponent, strict decimal parser, formatter, equal
remainder, balance, and deterministic settlement tests. RTL covers exact amount
input, JPY/KWD validation, equal/custom previews, mismatch blocking, historical
participant hydration, viewer mode, multi-currency totals, settlements,
reservation labels, deletion, and list/balance cache invalidation. PostgreSQL
integration covers transactional equal/custom creation, invalid-total rollback,
RBAC, custom amount-change semantics, removed-member history and revoked access,
foreign participant rejection, reservation `SET NULL`, Trip/split cascades,
per-currency balance invariants, and direct money CHECK constraints. No test
contacts an FX, booking, banking, or payment provider.

Stage 19 adds unit coverage for S3 signing/HEAD/delete behavior, opaque keys,
document RBAC, completion mismatches, idempotency, and storage behavior. RTL
covers cards, viewer mode, validation, XHR PUT progress/cancellation, completion
retry, update/delete actions, and API request contracts. Integration tests run
PostgreSQL 18.6 and pinned LocalStack `4.14.0` Community together, upload and download real
bytes through presigned URLs, verify the bucket's public-access block, reject a
tampered presigned URL, enforce pending visibility,
exercise same-Trip links and `SET NULL`, verify removed-uploader history, and
assert enum/FK/CHECK/unique/cascade constraints. They never use real AWS.

Stage 20 adds fast payload, dispatcher, scheduler, stale-threshold, processor,
worker-configuration, and retry/idempotency coverage. Docker integration uses
real `redis:8.10.1-alpine` and BullMQ Queue/Worker instances to verify retries,
job-ID deduplication, scheduler upserts, worker restart, and AOF-backed Redis
restart. The PostgreSQL + Redis + LocalStack suite verifies the complete HTTP
delete/outbox/dispatch/worker/S3 path, transient storage failure recovery,
Redis-loss reconstruction, stale uploads with and without objects, Trip-wide
cleanup, Redis-independent HTTP deletion, and upload/delete plus
completion/stale-cleaner serialization. Tests use short controlled backoffs and
call maintenance services directly instead of waiting for production cadence.

Stage 21 adds focused unit/component coverage for exact WebSocket origin checks,
room naming, cookie-session handshake, Trip join validation/authorization,
session expiry, cross-node room eviction, presence deduplication, runtime event
schemas, query-key mapping, reconnect status, DnD deferral, and unsaved form
preservation. Its dedicated integration suite starts real PostgreSQL 18.6, real
Redis 8.10.1, two Nest/Socket.IO servers, and real `socket.io-client` instances.
It verifies authentication and rejected origins, unauthorized joins, cross-node
presence and mutation fan-out, role downgrade plus REST `403`, revocation,
deletion, logout disconnect, reconnect/rejoin, invalid-session rejection, and
REST continuity plus later broadcast recovery during a temporary Redis
command-processing pause. Mocked gateway tests alone are not the Stage 21 gate.

Stage 22 adds cursor and discriminated-payload unit tests; service tests for
post-commit notification invalidation and no-op suppression; RTL coverage for
the bell, list states, pagination/deduplication, optimistic rollback, mark-all,
reconnect, cleanup, and cache isolation; and real PostgreSQL tests for inbox
scope, equal-timestamp cursor pagination, read idempotency, snapshots, access-
aware targets, fan-out/self-exclusion, document-ready idempotency, transaction
rollback, and direct enum/FK/CHECK enforcement. The realtime suite additionally
proves cross-node `notifications:invalidate` delivery and durable rows while
Redis command processing is paused.

Stage 26 adds a security gate spanning static/config checks, focused unit tests,
HTTP attacks, and real-container distributed behavior. Unit coverage validates
IP/email/user trackers, IPv6 `/64` normalization, public limiter responses,
Argon2 policy and rehashing, cookie flags, headers/CSP, filename sanitation, and
socket limits. HTTP coverage exercises evil Origin, missing mutation headers,
cross-site Fetch Metadata, JSON/media/body boundaries, prototype-pollution keys,
cache policy, and safe errors. The dedicated integration suite uses real
PostgreSQL and Redis with two Nest instances to prove shared/atomic limits,
brute-force behavior, enumeration-safe login, expiry, and fail-closed auth while
unrelated reads remain available. Existing domain suites provide the complete
RBAC/IDOR matrix. Real-browser CSP and penetration testing remain distinct manual
or future layers rather than being claimed by JSDOM/config tests.

TripForge should avoid testing implementation details and should not rely only
on expensive browser E2E tests.

## Accessibility testing pyramid

TripForge targets WCAG 2.2 AA through complementary layers:

```text
ESLint / static semantics
          ↓
RTL semantic, keyboard, pointer and focus tests
          ↓
axe-core component tests in JSDOM
          ↓
real-browser axe and manual visual checks
          ↓
screen-reader manual checks
```

`pnpm test:a11y` runs representative initial and dynamic component states with
`axe-core@4.13.0`; it does not replace explicit interaction tests. JSDOM cannot
verify CSS contrast, layout/reflow, focus obstruction, forced colors, or real
browser focus, so these stay in the reusable manual checklist. The repository
has no Playwright runner yet; browser axe remains deferred rather than silently
skipped. See [Accessibility](./accessibility.md) and the
[manual checklist](./accessibility-manual-qa.md).

## Commands

```text
pnpm test
  -> fast unit, component, and non-container HTTP tests

pnpm test:integration
  -> Docker + Testcontainers persistence tests

pnpm test:a11y
  -> representative WCAG-tagged axe + semantic/interaction component tests

pnpm test:security
  -> focused unit/HTTP checks plus real Redis/PostgreSQL multi-node integration

pnpm security:secrets
  -> focused tracked/unignored-text scan for high-risk secret shapes

pnpm security:audit
  -> fail on high/critical production dependency advisories

pnpm check
  -> fast developer gate: lint + typecheck + test + build

pnpm check:full
  -> pnpm check + PostgreSQL integration tests
```

The regular suite must remain usable without Docker. Integration tests use
`@testcontainers/postgresql@12.1.0`, `@testcontainers/localstack@12.1.0`,
`@testcontainers/redis@12.1.0`,
`postgres:18.6-bookworm`, and pinned `localstack/localstack:4.14.0` when a suite
needs object storage; each run gets independent infrastructure and never touches the
developer's Compose volumes. The suite applies committed migrations rather than
manually creating tables or using schema push, truncates test data between
cases, and does not depend on test order. Real PostgreSQL is intentional because
transactions, foreign keys, checks, timestamps, unique violations, and Drizzle
behavior are part of the authentication and Trips contracts. Real S3-compatible
requests are intentional because URL signing, CORS-relevant headers, ETags, byte
equality, and private object access are part of the document contract.
The automated suite deliberately uses the final pre-account Community release
so contributors and CI do not need a third-party credential. Compose separately
pins the required runtime version `2026.08.3`, which requires a LocalStack auth
token under the vendor's current distribution model. Set
`LOCALSTACK_TEST_IMAGE` plus `LOCALSTACK_AUTH_TOKEN` to test that runtime image.
Community LocalStack does not enforce IAM authorization. The suite therefore
asserts the private-bucket configuration and signature validation, while actual
anonymous-access denial remains an AWS/deployment security check rather than a
claim made by the local emulator.
The Community image also does not provide snapshot persistence. Restart QA for
S3 bytes therefore requires the authenticated `2026.08.3` Compose runtime; the
database persistence path remains independently testable without that token.

## GitHub Actions mapping

| Local command | Mandatory CI ownership |
| --- | --- |
| `pnpm ci:quality` | `CI / Quality` deterministic source gates |
| `pnpm ci:security` | `CI / Security` dependency, secret, and security regressions |
| `pnpm ci:integration` | `CI / Integration` Testcontainers services |
| `pnpm db:migrate` twice + migration verifier | `CI / Database` fresh PostgreSQL 18.6 |
| Compose config, production image builds, Trivy, smoke | `CI / Docker` |
| all five results | stable `CI / Gate` required check |

`pnpm ci:verify` approximates the mandatory non-container gates locally.
Hosted Docker publication and GitHub-plan features still require a real workflow
run; browser/manual accessibility, security, and performance debts remain
manual and are not reclassified by CI.

## Observability testing layers

`pnpm observability:test` covers production JSON parsing/redaction, request ID,
route privacy, in-memory OTel spans/metrics, and API log correlation.
`pnpm observability:config:check` uses the official Collector and Prometheus
container CLIs to validate Collector config, Prometheus config, rules, and
healthy/firing alert fixtures.

Focused API/worker/realtime tests prove instrumentation at domain boundaries;
real PostgreSQL/S3 suites remain responsible for provider integration behavior.
The local Docker QA layer validates actual OTLP acceptance, Jaeger service/spans,
Prometheus scrape/custom/runtime series, and operation with telemetry services
stopped. Manual UI inspection remains necessary for span waterfall semantics
and bounded label spot-checks; it does not replace automated privacy tests.

## AI testing

`pnpm ai:test` covers provider request construction (`store:false`), strict tool
schemas, identity-field exclusion, prompt-injection instructions, and bounded
tool availability. `pnpm ai:eval` runs deterministic fixtures for Trip lookup,
multi-day reasoning, reservations, expenses, search, all proposal types,
unsupported live information, and destructive/prompt-injection boundaries.
Neither command needs an OpenAI credential and both run in normal CI.

Integration coverage targets conversation ownership, outsider/removed-member
authorization, one-pending-turn uniqueness and stale recovery, tool output
bounds/privacy, moderation fail-closed behavior, turn/proposal atomicity,
viewer/role-change races, stale references, concurrent idempotent Apply, and
normal realtime invalidation. Frontend tests cover split/multiple SSE chunks,
UTF-8, completion/error handling, Stop, proposal controls, and accessibility
without announcing every token.

`pnpm ai:eval:live` is manual, optional, paid, and requires an intentionally
supplied `OPENAI_API_KEY`. It is not a PR gate and no live provider result is
claimed when credentials are unavailable.
