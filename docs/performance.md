# Performance engineering

TripForge treats performance work as measurement and regression prevention, not
as a one-time score chase. Bundle size, browser experience, API behavior, and
PostgreSQL plans are separate measurement domains. A result from one domain is
not presented as proof about another.

## Reproducible environment

The Stage 25 baseline was recorded on 2026-09-30 with:

- Apple arm64 / macOS;
- Node.js 24.18.0 and pnpm 12.3.4;
- Next.js 16.3.4 using the authoritative Webpack production build;
- PostgreSQL 18.6 in an ephemeral `postgres:18.6-bookworm` Testcontainer;
- two DB warmups followed by seven measured samples;
- `ANALYZE` after deterministic fixture creation.

Wall-clock and query timings are local diagnostic observations. They are not CI
thresholds and must not be extrapolated to production hardware or concurrency.
The pre-change clean web build took 28.70 s wall time (4.1 s Webpack compile).
Build time is recorded only as context; application runtime was the optimization
target.

## Baseline and measured changes

All bundle byte counts below come from a production build. Initial-route values
are the largest of `/login`, `/register`, `/notifications`, and `/trips` unless
marked shared. Raw bytes are used for deterministic budgets; gzip and Brotli are
included by `pnpm perf:bundle:report` for diagnosis.

| Area | Baseline | After | Change | Method |
| --- | ---: | ---: | ---: | --- |
| All emitted client JS | 2,567,150 B | 2,565,199 B | -0.1% | `.next/static/**/*.js` |
| Largest JS chunk | 586,218 B | 586,218 B | unchanged | emitted-file maximum |
| Maximum non-map initial JS | 669,804 B | 630,115 B | -5.9% | route client-reference manifests |
| Shared initial JS | 632,886 B | 506,200 B | -20.0% | intersection of route manifests |
| All emitted CSS | 112,282 B | 112,282 B | unchanged | `.next/static/**/*.css` |
| Maximum non-map initial CSS | 112,282 B | 29,125 B | -74.1% | route CSS references |
| Shared initial CSS | 112,282 B | 29,125 B | -74.1% | intersection of route CSS references |
| Lazy map JS | 1,080,683 B | 1,080,716 B | effectively unchanged | React loadable manifest |
| Lazy map CSS | global, 83,157 B | isolated, 83,157 B | removed from non-map routes | React loadable manifest |

The analyzer attributed approximately 1.06 MB parsed / 283 kB gzip to
`maplibre-gl`. It was already JavaScript-lazy and did not leak into the four
non-map routes. Its stylesheet was imported by the root layout, however, so it
was moved to the existing lazy `TripMap` boundary. The map retains its fixed
height loading status and error boundary.

The authenticated realtime bridge was statically reachable from the global auth
status. The Socket.IO stack (about 41 kB parsed / 12.7 kB gzip) and its validation
code therefore entered the initial graph for guests. The bridge is now loaded
only after authentication resolves. It still creates the same single shared
socket, connects at the same lifecycle point, and performs the same authoritative
notification refetches.

The full analyzer is opt-in:

```bash
pnpm --filter @tripforge/web analyze
```

`ANALYZE=true` is the only switch that enables `@next/bundle-analyzer`; normal
development and production builds are unchanged. Reports under `.next/analyze`
are already covered by the repository's `.next/` ignore rule and are not
committed.

## Deterministic bundle budgets

Run:

```bash
pnpm perf:bundle
pnpm perf:bundle:report
pnpm perf:test
```

`perf:bundle` performs a fresh Webpack production build and then checks semantic
metrics. It does not depend on hashed chunk names. A failure names the metric,
budget, actual value, and excess bytes.

| Protected metric | Optimized baseline | Budget | Headroom rationale |
| --- | ---: | ---: | --- |
| all JS raw | 2,565,199 B | 2,700,000 B | 5.3%, permits normal compiler drift |
| largest JS file raw | 586,218 B | 620,000 B | 5.8%, catches a new monolithic chunk |
| non-map initial JS raw | 630,115 B | 670,000 B | 6.3%, preserves realtime split |
| shared initial JS raw | 506,200 B | 545,000 B | 7.7%, protects every route |
| all CSS raw | 112,282 B | 120,000 B | 6.9%, catches broad CSS growth |
| non-map initial CSS raw | 29,125 B | 32,000 B | 9.9%, preserves map CSS isolation |
| shared initial CSS raw | 29,125 B | 32,000 B | 9.9%, protects all routes |
| lazy map JS raw | 1,080,716 B | 1,150,000 B | 6.4%, tracks the dominant feature |
| lazy map CSS raw | 83,157 B | 90,000 B | 8.2%, catches map stylesheet growth |
| map chunks in non-map routes | 0 routes | 0 routes | hard isolation invariant |

These thresholds intentionally have 5–10% headroom. Tiny tolerances would turn
compiler or compression noise into false failures. Compressed sizes remain
diagnostic because compressor versions can vary.

## Core Web Vitals and browser method

External targets are:

- LCP at or below 2.5 s;
- INP at or below 200 ms;
- CLS at or below 0.1.

They are targets, not observed field data. TripForge does not ship RUM,
`useReportWebVitals`, production console logging, or persistent telemetry in this
stage. A Lighthouse score is not a gate.

For a browser profile, use a production build and record at least three runs for
`/`, `/login`, `/trips`, a representative Trip workspace, `/notifications`, and
Trip search. Record cold cache separately from warm navigation and state the
network/CPU profile. Inspect the workspace waterfall, long tasks over 50 ms,
layout shifts, large itinerary interaction, search/combobox typing, expense
split editing, keyboard and pointer reorder, notification read state, mobile
navigation, and Trip A → dashboard → Trip A listener cleanup.

Browser verification was blocked in the Stage 25 execution environment: the
computer-use inventory exposed no browser surface or tab. Consequently there
are no claimed LCP, INP, CLS, network-waterfall, React Profiler, long-task, or
memory observations. Code, bundle, and database verification are reported
separately below.

Static layout review found:

- the map loading boundary and final map both reserve `h-80 sm:h-96`;
- the notification badge is inside a stable navigation control rather than
  replacing the control;
- no custom webfonts or first-party image-heavy hero path exists;
- MapLibre canvas and private S3 objects correctly remain outside `next/image`;
- reduced motion, canonical accessible lists, keyboard DnD, and the non-drag
  Move alternative remain intact.

## React, network, and client-state audit

The map remains one meaningful browser-only dynamic boundary. DnD stays scoped
to the itinerary workspace, form libraries remain in form route chunks, and no
barrel-import or `optimizePackageImports` change had measured evidence. Tiny
components were not split merely to increase chunk count.

Derived map points/routes already use appropriate memoized boundaries; adding
blanket `memo`, `useMemo`, or render counters would add complexity without a
browser profile proving expensive work. A stress Trip renders a deliberately
extreme 3,650-item itinerary, but the realistic fixture has 168 items and the
canonical list is an accessibility requirement. Virtualization was therefore
rejected pending a real browser trace. Notifications are keyset-paginated in
pages of 20 and deduplicated by ID; search remains limited to 50 results.

TanStack Query uses a 30 s general `staleTime`, 60 s place-search cache with a
5 minute `gcTime`, and 30 s Trip-search cache. Search uses 250 ms debounce,
place search uses 300 ms debounce/minimum input, and both pass `AbortSignal`.
Mutations invalidate domain-specific keys. Realtime resource keys are deduped
and only active observers refetch. Reconnect intentionally refreshes authoritative
state. Notification realtime still invalidates its complete key family so the
infinite list and unread badge cannot diverge.

Rapid-event coalescing, notification polling, global route-prefetch changes,
and stale optimistic suppression were rejected: there was no browser/network
evidence of a storm, while each could weaken collaboration consistency. Existing
effects remove Socket.IO listeners and disconnect on unmount; the socket module
remains a singleton. Map lifecycle stays owned by the map component, and upload
XHR cleanup/cancellation behavior is unchanged.

Client pages issue independent resource queries concurrently through TanStack
Query; no new Promise waterfall was found. Server pages do not contain a
sequential data-fetch chain. Private authenticated responses were not moved into
Next full-route caching, Redis, or a CDN.

## API and PostgreSQL fixture

Run the isolated harness explicitly:

```bash
pnpm perf:db
```

The command refuses `NODE_ENV=production`, starts a dedicated Testcontainer,
applies real migrations, inserts clearly prefixed deterministic data, validates
counts and relationships, runs `ANALYZE`, measures SELECT queries, and destroys
the container. It never truncates or connects to the developer/production DB and
is not part of application startup or migrations.

| Fixture | Members | Days | Destinations | Itinerary | Routes | Reservations | Expenses | Documents |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Typical | 6 | 21 | 8 | 168 | 32 | 48 | 240 | 80 |
| Stress | 12 | 365 | 50 | 3,650 | 400 | 600 | 3,000 | 500 |

The notification fixture contains 4,500 rows across three users, including
1,500 rows for the profiled user. Search text is deterministic and selective.
Validation confirms Day/Destination and route/item Trip relationships, balanced
integer expense splits, transport-kind consistency, ready-document timestamps,
RBAC member counts, and all exact table counts.

### Warm local query observations

Values are medians of seven client-observed runs after two warmups. Payload is
the raw JSON serialization of returned SQL rows, not an HTTP compressed DTO.

| API/query path | Rows | Median | Payload | Plan observation |
| --- | ---: | ---: | ---: | --- |
| Trips list | 2 | 0.385 ms | 594 B | small-table nested loop |
| Trip detail | 1 | 0.358 ms | 297 B | small-table nested loop |
| Members | 12 | 0.403 ms | 3.2 kB | hash join, in-memory sort |
| Destinations | 50 | 0.466 ms | 15.5 kB | sequential scan is cheapest at this scale |
| Days | 365 | 1.406 ms | 96.7 kB | exact 365-row estimate, in-memory sort |
| Itinerary | 3,650 | 15.562 ms | 2.34 MB | hash join, estimate 3,610 vs 3,650 |
| Routes | 400 | 1.995 ms | 218 kB | in-memory sort |
| Reservations + transport | 600 | 2.887 ms | 429 kB | set-based hash join |
| Expenses + share count | 3,000 | 15.525 ms | 1.70 MB | 12,000-row set join, no N+1 |
| Expense balances | 4 | 2.875 ms | 389 B | integer aggregate over same 12,000 splits |
| Ready documents | 500 | 1.971 ms | 315 kB | in-memory sort |
| Notification latest page | 50 | 0.803 ms | 19.6 kB | top-N in-memory sort over 1,500 user rows |
| Notification next keyset page | 50 | 1.057 ms | 19.6 kB | stable tuple cursor, top-N sort |
| Notification unread count | 1 | 0.491 ms | 16 B | partial unread bitmap index |
| Notification target access | 2 | 0.329 ms | 93 B | one set-based RBAC query |
| Selective itinerary search | 37 | 0.815 ms | 3.5 kB | estimate 36 vs 37; bounded to 50 |
| Cleanup outbox batch | 100 | 0.622 ms | 8.5 kB | partial index + `SKIP LOCKED` |

`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` reported warm shared-buffer hits and
zero shared reads in this run. All explicit sorts used memory; no disk spill or
large cardinality mismatch appeared. Sequential scans are retained where the
fixture has only two Trips or where one Trip owns most rows; replacing them with
forced index scans would optimize the plan display rather than the workload.

The Stage 23 FTS/trigram GIN indexes and ranking expression remain unchanged.
At roughly 3,800 itinerary rows PostgreSQL correctly chose a sequential scan for
the selective search in this local all-memory fixture; schema integration tests
continue to verify the critical indexes. Search still uses the full production
ranking query and max-50 contract in application code.

Repository inspection found bounded, set-based hydration rather than N+1:
reservations use one transport join; expenses use one list query plus one shares
query for all expense IDs; documents join uploader data; notifications perform
one target-access batch for the page; search is one bounded union query. No
mega-query rewrite was warranted.

Existing list/schedule indexes overlap some simpler `trip_id` indexes in prefix
shape, notably expenses and reservations. They were not dropped without
production `pg_stat_user_indexes`, write volume, and workload evidence. No new
index or migration was justified by the measured plans.

The API uses `pg.Pool` defaults: maximum 10 connections, 10 s idle timeout, no
connection acquisition timeout, and no maximum lifetime. Production tuning is
deferred until task count, RDS limits, and workload are known. Transaction
boundaries, integer money calculations, runtime validation, authorization,
direct-to-S3 transfers, and external I/O placement remain unchanged. No custom
compression middleware or Redis response cache was added.

For end-to-end local HTTP timing after seeding an explicitly chosen environment,
use repeated curl runs and record both warm/cold state and dataset:

```bash
curl --silent --output /tmp/tripforge-response.json \
  --write-out 'status=%{http_code} ttfb=%{time_starttransfer}s total=%{time_total}s bytes=%{size_download}\n' \
  --cookie "$TRIPFORGE_COOKIE" \
  http://127.0.0.1:4000/api/trips
```

The DB harness intentionally does not claim these query-path medians are full
Nest/HTTP latency.

## Other runtime boundaries

- Background cleanup remains bounded by its existing batch/concurrency rules;
  no synthetic worker tuning was applied.
- S3 upload/download bytes still travel directly between browser and object
  storage. The browser bundle does not include the AWS SDK.
- ORS, MapTiler, and S3 latency is external and was not compared with local DB
  requests or hidden behind stale caches.
- No worker, Redis cache, Web Worker, APM, RUM, load test, global PostgreSQL
  setting, `VACUUM FULL`, or infrastructure redesign was introduced.
- Final local images are web 319.3 MB, API/worker 320.8 MB, and migrate 1.386 GB.
  The known migration-image debt was recorded, not allowed to derail
  product-runtime work.
- The final Compose build succeeded; DB, Redis, migrations, API, and web reached
  their expected running/completed state. Full-stack startup was blocked by
  LocalStack 2026.08.3 exiting with code 55 because this environment has no
  `LOCALSTACK_AUTH_TOKEN`; the existing token/security model was not weakened.

## Rejected optimizations

- No blanket React memoization: no browser trace demonstrated expensive repeated
  renders, and comparison overhead is not free.
- No itinerary/marker virtualization or clustering: the realistic scale is
  modest, accessible lists must remain canonical, and browser profiling was
  unavailable.
- No additional/drop index migration: measured estimates were accurate, sorts
  stayed in memory, and relevant latency was low; duplicate decisions need
  production usage statistics.
- No forced GIN/index plan: the planner may correctly prefer a sequential scan
  for a small or high-fraction table.
- No response-field trimming: the inspected contracts protect explicit API
  boundaries and no clear unused sensitive/large field was proven.
- No realtime batching or weaker invalidation: consistency evidence outweighs
  speculative request savings.
- No API compression, Redis response caching, authenticated Next route caching,
  custom prefetch policy, Web Worker, or dependency replacement: none had
  measured evidence in the relevant environment.

## Regression checklist

Before accepting a performance change:

1. Run `pnpm perf:test`, `pnpm perf:bundle`, and `pnpm perf:db`.
2. Run lint, typecheck, unit tests, integration tests, accessibility tests, and
   the production analyzer build.
3. Verify authentication/RBAC, realtime reconnect/listener cleanup, background
   jobs, maps and fallback lists, DnD keyboard/Move behavior, exact expense
   balances, notification cursors, and search ranking.
4. When a browser is available, execute the browser profile above and record
   observations rather than committing large traces.
5. Recheck Docker image sizes and Compose health without weakening the existing
   LocalStack token/security model.

## Observability overhead

`pnpm observability:overhead` compares 200 sequential production-build
`/health` requests with OTel disabled and enabled against deliberately
unreachable local exporters. A 2026-10-01 ARM laptop run measured 1.749 ms mean
disabled and 2.138 ms enabled: +0.389 ms absolute (+22.202% relative against a
very small baseline). This is a local microbenchmark, not a production latency
claim; representative database/provider workloads and concurrency may differ.

The implementation keeps 15-second metric exports, 10-second runtime monitoring,
bounded 3-second exporter timeouts, 10 HTTP histogram buckets, production 10%
parent-based trace sampling, placeholder-only PG reporting, no Redis command
instrumentation, and small structured log fields. Stage 25 browser bundle budgets
remain authoritative; server-only Pino/OTel packages must not enter static chunks.
