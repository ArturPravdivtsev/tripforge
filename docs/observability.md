# Production observability

TripForge uses three deliberately separate signals:

```text
JSON stdout logs                         discrete operational events
OpenTelemetry metrics → Collector       aggregate trends and alerts
OpenTelemetry traces  → Collector       causal request and job paths
                              ├→ Prometheus
                              └→ Jaeger
```

An observability outage is not a business outage. The API, worker, and Next
server export OTLP over bounded HTTP requests, but none depends on Collector,
Prometheus, or Jaeger for correctness or readiness. PostgreSQL remains business
truth; neither PostgreSQL nor Redis stores telemetry history.

## Local stack

The base Compose stack remains independent. Start the local telemetry services
and product services with:

```bash
docker compose -f compose.yaml -f compose.observability.yaml up --build
```

The LocalStack token can be avoided when validating only API/web telemetry:

```bash
docker compose -f compose.yaml -f compose.observability.yaml \
  up --build db redis migrate api web otel-collector prometheus jaeger
```

Open <http://127.0.0.1:9090> for Prometheus and
<http://127.0.0.1:16686> for Jaeger. Collector's OTLP and Prometheus-exporter
ports remain internal. On x86-64, set
`OTEL_COLLECTOR_IMAGE=otel/opentelemetry-collector-contrib:0.162.0-amd64`;
the checked-in default is the equivalent pinned `0.162.0-arm64` tag required
by the current ARM development host because the upstream generic tag does not
publish a multi-architecture manifest.

Useful commands:

```bash
pnpm observability:config:check  # Collector, Prometheus, rules + rule fixtures
pnpm observability:test          # logger, privacy, OTel, metrics, API boundary
pnpm observability:overhead      # local /health microbenchmark
docker compose -f compose.yaml -f compose.observability.yaml ps
docker compose -f compose.yaml -f compose.observability.yaml logs api worker
```

Prometheus and Jaeger are unauthenticated development UIs bound to loopback.
They require private networking and authentication before any production use.

## Configuration and resources

Each process has an explicit resource identity:

| Process | `service.name` |
| --- | --- |
| Nest HTTP API | `tripforge-api` |
| BullMQ worker | `tripforge-worker` |
| Next server | `tripforge-web` |

Resources also include `deployment.environment`, `service.version` from
`TRIPFORGE_VERSION`, and a generated or explicit `service.instance.id`. No Git
command runs in a production process. Supported controls are:

| Variable | Default/meaning |
| --- | --- |
| `LOG_LEVEL` | `info` in production, `debug` otherwise; validated Pino level |
| `OTEL_ENABLED` | `false`; only exact `true` initializes exporters |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://127.0.0.1:4318` |
| `OTEL_EXPORT_TIMEOUT_MS` | `3000`, bounded |
| `OTEL_METRIC_EXPORT_INTERVAL_MS` | `15000` |
| `OTEL_TRACES_SAMPLER` | `parentbased_traceidratio` |
| `OTEL_TRACES_SAMPLER_ARG` | `0.1` production, `1` development/test |
| `TRIPFORGE_VERSION` | package/local version override |
| `OTEL_SERVICE_INSTANCE_ID` | optional replica/container identity |

Metrics are not trace-sampled. Tests do not export telemetry unless they opt in.
Both Nest entrypoints import a small registration module before AppModule,
Express, `pg`, AWS SDK, and worker modules load. Next uses its supported
server-only `instrumentation.ts` entrypoint. `SIGINT` and `SIGTERM` attempt SDK
shutdown within the configured export timeout; a blocked backend cannot hold
container shutdown indefinitely.

## Structured logs and correlation

Core Pino writes one compact JSON object per line to stdout. There are no log
files or OpenTelemetry Logs SDK. `AppLogger` is both the domain logging boundary
and Nest `LoggerService`, so bootstrap and application records share one format.

Standard fields are `time`, `level`, `service`, `environment`, `version`, and
stable `event`. Request records add `requestId`, `method`, normalized `route`,
`statusCode`, and `durationMs`. If an OTel span is active, the same record gains
its real `traceId` and `spanId`; no synthetic trace identity exists.

The first API middleware accepts `X-Request-ID` only when it is a UUID;
otherwise it generates `crypto.randomUUID()`. It returns the safe value in the
response and stores only that value in `AsyncLocalStorage`. One
`http.request.completed` record is emitted per request. Requests over 1000 ms
use `warn`; other completions use `info`.

Normal logs never include request/response objects, bodies, raw URLs, query
strings, raw IPs, SQL values, storage keys, or third-party error messages.
Production errors contain safe categories such as `errorType`, stable code,
route, and correlation fields; raw stacks are development-only. Keys matching
password, token, session, cookie, authorization, secret, API/access key, or
presigned URL are recursively censored, with Pino redaction as a second layer.
Rate-limit warnings are aggregated by fixed limiter category and rate-disciplined
to avoid attacker-controlled log storms.

## Traces

Explicit instrumentation covers Node HTTP, Express, `pg`, AWS SDK v3, and Node
runtime. Broad ioredis instrumentation is deliberately disabled because Redis
commands can contain BullMQ payload and room data. BullMQ processors instead
create manual root/internal spans with fixed job name, attempt, and outcome.
The no-work 30-second dispatcher emits only debug/metrics and no trace.

HTTP server span names and URL attributes are overwritten with Express route
templates. UUIDs in mounted base paths become `:id`; unmatched paths become
`__unmatched__`. Query parameters, search text, request headers, and user IDs
are not exported. Unexpected 5xx errors set error status; ordinary 4xx domain
outcomes are not presented as internal failures.

PostgreSQL instrumentation keeps enhanced reporting, SQL-comment propagation,
and bind-value enrichment off. ORS uses a bounded client span with only provider,
operation, and route mode. AWS SDK spans describe the S3 operation; credentials,
object bytes, presigned URLs, and object keys are not custom attributes. Selected
domain boundaries include `route.calculate` and storage cleanup; every service
method does not receive a redundant span.

Next tracing is server-side only under `tripforge-web`. There is no browser OTel,
RUM, Sentry, or custom localStorage/header trace scheme. Consequently a Next
server render and a later browser-originated API call may be separate traces.

## Metrics and cardinality

Custom names are centralized under the `tripforge.*` prefix. Durations and ages
use seconds; counts use semantic count units. HTTP/provider/worker histograms
use 5 ms, 10 ms, 25 ms, 50 ms, 100 ms, 250 ms, 500 ms, 1 s, 2.5 s, and 5 s
buckets. Collector exports a Prometheus scrape endpoint; applications expose no
public `/metrics` route.

| Metric | Type/unit | Bounded attributes |
| --- | --- | --- |
| `tripforge.http.server.requests` | counter, requests | method, route template, status code/class |
| `tripforge.http.server.duration` | histogram, seconds | same HTTP dimensions |
| `tripforge.http.server.in_flight` | up/down counter, requests | method |
| `tripforge.auth.outcomes` | counter | aggregate outcome |
| `tripforge.security.rate_limit.rejections` | counter | fixed limiter category |
| `tripforge.realtime.active_sockets` | up/down counter | none |
| `tripforge.realtime.active_joins` | up/down counter | none |
| `tripforge.realtime.events` | counter | fixed lifecycle/failure event |
| `tripforge.worker.jobs` | counter | fixed job name, outcome |
| `tripforge.worker.job.duration` | histogram, seconds | fixed job name, outcome |
| `tripforge.storage.outbox.incomplete` | gauge, items | none |
| `tripforge.storage.outbox.oldest_age` | gauge, seconds | none |
| `tripforge.db.pool.connections` | gauge, connections | total/idle state |
| `tripforge.db.pool.waiting_requests` | gauge, requests | none |
| `tripforge.external.provider.requests` | counter | ORS provider/operation/mode/outcome |
| `tripforge.external.provider.duration` | histogram, seconds | same provider dimensions |

Outbox values update during existing maintenance cycles, not per HTTP request.
Pool gauges read controlled `pg.Pool` counts. Runtime instrumentation supplies
event-loop, heap, GC, and active-resource signals at a 10-second monitoring
precision. S3 metrics are not duplicated mechanically; cleanup failures remain
visible through worker signals.

The privacy/cardinality contract is strict:

| Attribute | Logs | Traces | Metrics |
| --- | --- | --- | --- |
| user ID | rare/intentional only | avoid | **NEVER** |
| Trip/resource ID | rare/intentional only | avoid | **NEVER** |
| request ID | yes | no custom attribute | **NEVER** |
| trace ID | correlation | native | **NEVER** |
| route template | yes | yes | yes |
| status code | yes | yes | yes |
| fixed job name | yes | yes | yes |
| search query | **NEVER** | **NEVER** | **NEVER** |
| email/IP/filename/storage key | **NEVER** by default | **NEVER** | **NEVER** |

## PromQL recipes

Collector's translation produces underscore-separated Prometheus names.

```promql
# Request rate
sum(rate(tripforge_http_server_requests[5m])) by (route, method)

# 5xx ratio
sum(rate(tripforge_http_server_requests{status_class="5xx"}[5m]))
/
clamp_min(sum(rate(tripforge_http_server_requests[5m])), 0.001)

# p95 API duration in seconds
histogram_quantile(0.95,
  sum by (le) (rate(tripforge_http_server_duration_bucket[10m])))

# Worker failure rate
sum(rate(tripforge_worker_jobs{outcome="failed"}[10m])) by (job_name)

# Cleanup backlog and oldest age
tripforge_storage_outbox_incomplete
tripforge_storage_outbox_oldest_age

# PostgreSQL saturation
tripforge_db_pool_waiting_requests

# Active sockets and Redis publisher failures
tripforge_realtime_active_sockets
increase(tripforge_realtime_events{event="publisher_failure"}[5m])
```

## Alerts

Rules use only stable `service` and `severity` labels. There is no Alertmanager
or notification delivery in this stage.

| Alert | Meaning / likely causes | First step |
| --- | --- | --- |
| `TripForgeHighApi5xxRatio` | >5% 5xx sustained; regression, dependency, or capacity failure | inspect a representative trace and correlated error log |
| `TripForgeHighApiLatency` | p95 >1 s sustained; database/provider/pool latency | compare HTTP, PG, S3, and provider spans |
| `TripForgeRepeatedWorkerFailures` | at least three failures in 10 min | find `worker.job.failed`, then inspect its trace |
| `TripForgeOutboxBacklogOld` | oldest incomplete cleanup >15 min | inspect dispatcher/job failures, then S3 |
| `TripForgeDbPoolWaiting` | sustained pool waiters | inspect slow PG spans and Stage 25 query plans |
| `TripForgeRealtimePublisherFailures` | Redis cross-node publishing degrades | inspect `realtime.redis.unavailable` and Redis health |

`promtool test rules` fixtures cover non-firing and firing critical cases;
config validation also parses all six rules.

## Diagnosis runbooks

Request failure: take `X-Request-ID` from the response, locate its JSON completion
or safe error record, copy `traceId`, inspect the waterfall in Jaeger, then use
Prometheus to decide whether it is isolated or systemic.

Slow API: confirm p95 in Prometheus, open a representative slow trace, compare
HTTP time with PG/S3/provider children, and use the Stage 25 `EXPLAIN` workflow
when PostgreSQL dominates.

Worker failure: inspect the worker failure counter by fixed job name, locate
`worker.job.failed`, inspect the worker/S3 trace, then check incomplete count and
oldest outbox age. A final failure remains durable in PostgreSQL.

Realtime degradation: compare active sockets/joins with publisher failures,
inspect safe Redis-adapter logs and Redis health, then use the two-node realtime
integration model. Presence is approximate and is not a per-user metric.

## Failure behavior, retention, and debt

Exporter errors are bounded and do not fail requests, jobs, SSR, readiness, or
health. `/health` stays minimal and excludes optional telemetry dependencies.
Prometheus retains seven days locally; local Jaeger retention is development
only. Production log transport/retention belongs to the future platform.

Deferred work includes browser RUM and browser error collection, a production
telemetry retention review, authenticated/private UI placement, production
dashboards, and vendor trace-to-log deep links. These are explicit deployment
decisions, not hidden dependencies of the application.

## CI validation

`CI / Quality` runs `pnpm observability:config:check` and
`pnpm observability:test`; Collector, Prometheus, rules, safe logging, traces,
and metrics regressions are merge-blocking. `CI / Docker` also validates the
base plus observability Compose model. It does not start the full telemetry
stack for every unit job, and production images must smoke-start with
`OTEL_ENABLED=false`.

## AWS destination

ECS always sends existing JSON stdout/stderr to separate bounded-retention
CloudWatch groups for web, API, worker, and migration. Enhanced Container
Insights is configurable infrastructure telemetry; it does not replace
application traces and metrics.

When enabled, an immutable AWS Distro for OpenTelemetry sidecar receives OTLP
HTTP only on `127.0.0.1:4318` and exports traces to X-Ray plus metrics to
CloudWatch/EMF. Local Prometheus and Jaeger are not production services.
Collector permissions contain only X-Ray and CloudWatch write calls; exporter
failure remains fail-open. Cloud alarms cover ALB, target health, ECS, RDS,
Redis, and zero-tolerance evictions. SNS email is opt-in.

Cloud QA must confirm safe logs, an API/PG trace, worker trace, runtime metrics,
and absence of passwords, cookies, AWS credentials, presigned URLs, search
queries, Redis AUTH, and database secrets. See [AWS deployment](./aws-deployment.md).

## AI observability

The API records `tripforge.ai.turns`, `tripforge.ai.duration`,
`tripforge.ai.tokens`, `tripforge.ai.tool_calls`, and
`tripforge.ai.proposals`. Allowed attributes are bounded `model`, `outcome`,
`tool_name`, token `kind`, and `proposal_type`. User, Trip, conversation, prompt,
answer, notes, search query, and tool output are never metric labels.

Safe events include `ai.turn.completed`, `ai.turn.failed`, `ai.tool.failed`, and
proposal outcomes. They contain only error categories and bounded counts/types.
Manual AI spans may carry the same bounded attributes; hidden reasoning and
reasoning text are never stored, logged, or returned. Token usage persists as
input, cached input, output, and reasoning counts. Monetary price is deliberately
not stored because pricing is external mutable policy. An OpenAI outage is an
optional-feature degradation and must not make `/health` fail or page as a full
TripForge outage.
