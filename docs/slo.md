# Initial service objectives

These are candidate objectives, not measured production compliance. Window:
rolling 30 days. Owner: release operator/on-call engineer; SEV-1 core/data or
security, SEV-2 optional-feature degradation, SEV-3 isolated low-impact issue.

## Core service and SLIs

Core includes session authentication, Trip/RBAC, itinerary, persisted routes and
reservation metadata, expenses/balances, document metadata and signing,
notifications and search. External file-transfer bytes, new ORS calculations,
MapTiler, OpenAI generation and telemetry delivery have separate dependency
boundaries. A DB outage counts as core failure; missing Redis does not make
readiness fail, but a legitimate protected action's failure still affects its
customer-facing SLI. Do not hide those failures by labelling Redis optional.

Availability objective: **99.9%**. Request SLI = successful eligible requests /
all eligible requests. Count unexpected 5xx, network failures and unexpected
capacity-generated 429. Exclude intentional validation/auth/RBAC 4xx and abusive
traffic's expected 429; an erroneous denial is not an intentional exclusion.
Exclude `/health`, `/ready`, synthetic chaos fixtures and external-provider
operations from the business-request denominator, with separately tracked probe
outcomes. Correlate ALB and app counters to avoid double-counting a failed request.
Network failures before the API must be measured at ALB/approved synthetic
clients; app counters alone cannot establish end-to-end availability.

Core latency candidate: **p95 <500ms, p99 <1000ms**, server HTTP duration for
business metadata/read/write routes, measured per important route and aggregate.
Argon2 login benchmarking is separate from the representative CRUD distribution;
authentication availability remains core. File bytes/provider waits/AI SSE have
separate latency series. Do not use local SQL timing, Lighthouse or k6 as proof
of 30-day production latency compliance.

## Separate objectives

| Boundary | Initial treatment |
| --- | --- |
| Realtime | Fresh auth/join + authoritative convergence; record update latency and reconnect success. No production percentile SLO asserted |
| ORS / MapTiler | Availability/error/duration recorded independently; persisted data usable during provider failure |
| S3 | Provider and direct-transfer failures separate; document correctness and retryable pending metadata remain product obligations |
| AI | Record success, TTFT, turn duration, tool rounds, tokens, safe failure and cancellation; no live threshold claimed without provider baseline |
| Telemetry | Export failure may lose observations, not business correctness; monitor pipeline separately |
| Recovery | RDS RPO <=5min, RTO <=60min objectives; neither verified by local logical restore |

## Error budget and release policy

Allowed bad requests = `0.001 * eligible requests in 30 days`. Time-equivalent
budget at continuous availability = **43.2 minutes / 30 days**; a request-based
SLI is not literally minutes of downtime. Burn rate = observed failure fraction /
0.001. No production history exists, so no remaining-budget percentage is claimed.

When exhausted or burning rapidly: pause risky feature releases and discretionary
schema contracts, investigate/recover, allow narrowly reviewed reliability or
security fixes. Resume after symptoms recover and the incident/release owner
records an explicit risk decision. A planned release is not an automatic budget
exception; planned downtime counts if it affects eligible user requests.

Existing symptom alerts cover sustained API 5xx/latency, unhealthy targets, pool
waiting, old outbox backlog, repeated worker failures, realtime publisher failure
and Redis evictions. CPU/memory alarms are diagnosis, not standalone SEV-1.
Existing coarse 5xx/latency rules are not complete error-budget enforcement:
production needs low-volume-aware, multi-window burn alerts plus external
network-failure coverage. Initial paging candidate: burn >14.4x in both 5m/1h;
ticket candidate >6x in both 30m/6h, with minimum eligible-request volume. Tune and
test with hosted traffic before enabling; no untested pager routing is claimed.

See [observability](./observability.md) for actual metric names and bounded labels;
never add user/Trip IDs or request bodies to SLI labels.
