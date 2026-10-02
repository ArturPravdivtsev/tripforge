# Capacity qualification

Scope: disposable local Stage 31 HTTP experiments, not a production SLA or user
limit. The accepted measured profile table is populated from
`readiness-results/release-final/k6-{smoke,load,stress}.json` and
`readiness-results/release-soak/{capacity,runtime-samples,socket-soak}.json`.
The former labelled chain supplies gates/browser/drills; the soak-only repeat
preserves earlier evidence after a user-turn interruption. Incomplete/failed
fixture runs are excluded. Full provider calls, S3 bytes, Argon2-per-iteration,
live OpenAI and production users are excluded.

## Fixture and topology

20 unique registered users/Trips; 420 Days; 3,360 itinerary items; 480 reservation
rows; 960 expenses + equal split rows; 320 ready document metadata rows (no files);
400 notifications. PostgreSQL generated search vectors and `ANALYZE` are real.
Session setup happens once. Workload is 80% metadata reads/search/notifications,
20% bounded idempotent Trip PATCH/read-all writes, 100ms think time; no unbounded
row creation. Representative auth hash cost has a separate ten-login benchmark.

One production-compiled Nest API using test-only external-provider DI, one real
worker (concurrency 5), PostgreSQL 18.6, Redis 8.10.1, local S3 emulator 4.14.0.
Rate limiting disabled only in the test bootstrap to measure business paths;
shared limiter fail-closed behavior is separately tested on a protected replica.
Web production build is used for browser QA, not HTTP k6 workloads. CLI refuses
non-loopback targets; the launcher owns newly created disposable containers.

| Profile | Default | Release diagnostic thresholds |
| --- | --- | --- |
| smoke | 2 VU, 1m | core p95 <500ms, p99 <1000ms, unexpected 5xx/network <1%, success checks >99% |
| load | 20 VU, 10m | same; no universal 100ms target |
| stress | ramp targets 25/50/75/100, 2m each (8m) | find saturation if observed, not force a crash |
| soak | 20 VU, 30m | same + warmup vs stable memory/pool/listener observations |

Versions: Playwright 1.63.0, k6 v2.3.0, axe 4.13.0. Official k6 archive checksum
verification is required by the installer. Results on the ARM/macOS laptop and
small Docker Desktop VM cannot establish Fargate/RDS limits; existing unrelated
containers and host activity can influence measurements.

## Results and interpretation

See the [Stage 31 qualification report](./stage31-qualification.md) for accepted
actual profile durations/RPS/latency/error and hardware/resource observations.

| Accepted profile | Requests | Mean RPS | p95 ms | p99 ms | Unexpected errors |
| --- | ---: | ---: | ---: | ---: | ---: |
| smoke, 2 VU × 1m | 1076 | 17.904 | 16.436 | 131.695 | 0% |
| load, 20 VU × 10m | 106686 | 177.791 | 23.023 | 215.614 | 0% |
| stress, four 2m linear ramps to25/50/75/100 | 207679 | 432.568 | 33.774 | 326.314 | 0% |
| soak, 20 VU × 30m +100 sockets | 327214 | 181.779 | 20.483 | 90.305 | 0% |

All success checks100%; stress target100 is reached at the end, not held for2m.
Apple M1/8CPU/16 GiB, Node24.18.0, Docker VM8CPU/4109803520 bytes, fixture and
topology above apply to every row. Actual HTTP durations60.098/600.063/480.107/
1800.068s. Final accepted soak is the dedicated repeat after turn interruption;
only it retains full continuous API resource observations, not the earlier chain.

No breakpoint is claimed unless an accepted stress run actually crosses a
threshold. If the highest tested workload passes, report “not reached within
tested range”, not “unlimited” or a calculated production user count.

An earlier independently launched 30-minute socket companion lost its API when
the HTTP launcher finished first; its final 95 seconds failed and it is excluded
from acceptance. The corrected launcher waits for socket readiness, runs both
soak workloads together, then waits for both completions before shutdown. This
launcher failure is not evidence of application capacity saturation.

100 authenticated sockets across two API nodes received the same cross-node
invalidation in the final local drill (single observation 17ms, not a percentile).
Disconnect/reconnect/replacement performs fresh authentication/join and refetch.
No MaxListenersExceededWarning was observed; long-duration websocket/browser
resource behavior requires its own scope, not inference from idle HTTP clients.

Accepted sustained single-node companion:100 real joins,100 connected clients
and100 invalidation listeners in every179 ten-second sample,163550 invalidations,
failures0/reconnects0 over1800s. API one-second samples keep HTTP request listeners1,
pool max10, waiting p95=0/max19; normal idle eviction restores connections/waiters0
in29.537s before shutdown. API CPU one-core p95=25.877%, RSS median first/last5m
243.172/199.453 MiB, heap79.215/81.688 MiB; GC2617 events/2105.148ms. Socket-client
heap median12.422→13.765 MiB (+1.344) despite stable listeners/declining RSS:
longer-run heap profiling remains a limitation, not a blanket no-leak guarantee.

Worker: 120 PG outbox rows survived downtime and Redis FLUSHDB, then drained in
31.211s (~3.84 rows/s including the 30s scheduler cadence), failed rows zero.
This measures recovery throughput, not raw worker/S3 delete capacity. Active-job
SIGTERM completed without SIGKILL; a duplicate completed-row delivery nooped.

Pool pressure explicitly queued real `pg_sleep` work: max 10 business connections,
final drill peak waiting 40, final waiting 0. Readiness uses a separate max-1 pool. Default
cloud rolling budget is 117, actual RDS max_connections still operator-owned.
Keep API pool 10 / worker 4 / migrator 1 and bounded web/API autoscaling until
hosted evidence identifies the first bottleneck. RDS Proxy, cache/index changes,
worker autoscaling and larger pools are not justified by these local experiments.
