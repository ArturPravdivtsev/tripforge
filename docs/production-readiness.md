# Production readiness — Stage 31

Qualification date: 2026-10-03 Europe/Moscow; evidence timestamps use UTC.
Local evidence is not AWS qualification or a
production-capacity promise. No new AI/product feature is introduced.

## Evidence and status vocabulary

Only these statuses are used: **Verified locally**, **Verified in browser**,
**Verified in GitHub**, **Verified in AWS**, **Pending external environment**,
**Known limitation**.
No row currently qualifies as Verified in AWS. A release operator must attach
environment, source revision, image digests, timestamp and evidence before
changing a cloud row. Tests run on newly created disposable services, never the
developer's existing database/Compose project.

| Area | Status | Automated evidence | Manual evidence | Cloud evidence | Known limitation |
| --- | --- | --- | --- | --- | --- |
| Authentication register/login/reload/logout/Back | Verified in browser | Chromium; HttpOnly cookie; `/auth/me` 401 after logout | AT pending | Pending | Secure cookies/TLS need staging |
| Trip create/open/edit/dashboard | Verified in browser | Real forms/API; disposable Trip cleanup | AT pending | Pending | Local browser scope |
| Two-user RBAC, upgrade, removal | Verified in browser | Independent contexts; viewer 403; removal 404/live redirect | — | Pending | Local browser scope |
| Itinerary create/edit/reorder/move | Verified in browser | Pointer drag, Space/arrows, cross-Day Move; API/reload persistence | AT pending | Pending | Native AT not inferred from keys |
| Transport reservation | Verified in browser | Create/edit/list; persisted train/ferry subtype | — | Pending | Local browser scope |
| Equal/custom expenses | Verified in browser | Integer shares/API balances; formatted settlement | — | Pending | No FX feature added |
| Documents | Verified in browser | Presigned local-S3 PUT; byte-equal download/delete | Long-run resource profiling pending | Pending | Emulator is not AWS durability/IAM proof |
| Notifications/search/realtime | Verified in browser | Multi-context/tab updates; filters/navigation/no-results | — | Pending | Local browser scope |
| Private assistant | Verified in browser | Provider-only DI; SSE Stop, Apply/Dismiss, viewer denial/private 404 | Live provider pending | Pending | No live OpenAI calls |
| CSP/axe/reflow/keyboard | Verified in browser | Six screens; CSP0/axe0; 320/375/768px; keyboard paths | Native AT/zoom pending | Pending | Automation does not prove complete accessibility |
| VoiceOver + Safari, actual 200%/400% zoom | Pending external environment | Keyboard/reflow only | Not performed | — | Viewports are not native zoom/AT |
| Browser repeated upload/cancel resource profiling | Known limitation | Single successful file lifecycle | Not performed | — | Long-run XHR/Blob behavior unknown |
| `/health`, `/ready`, idle-pool recovery | Verified locally | Liveness200; bounded PG-only readiness200/503; pool/drain fixtures | — | Pending ALB | Local probe is not deployed target evidence |
| Least-privilege DB role | Verified locally | CRUD/worker/locks; role/schema/database DDL denied | Secure bootstrap documented | Pending | Actual RDS grants/rotation need operator verification |
| Pool pressure and connection budget | Verified locally | Max10; waiters drain; Terraform rolling budget117 | Headroom review pending | Pending | Actual RDS limit unknown |
| Actual RDS connection limit/headroom | Pending external environment | Mock budget rejects100 | TLS `SHOW max_connections` pending | Not performed | Enter verified limit before release |
| PostgreSQL outage/recovery | Verified locally | Owned PG stop; core500/ready503/health200; automatic recovery | Runbook reviewed | Pending | Not RDS failover/PITR proof |
| Redis outage/data loss | Verified locally | Core/ready200; protected login503; PG outbox survives FLUSHDB | Runbook reviewed | Pending | TLS/AUTH/Multi-AZ need staging |
| Worker outage/backlog/active shutdown | Verified locally | 120 rows drain; SIGTERM job completes; duplicate noops | Runbook reviewed | Pending | Not production throughput maximum |
| S3 outage/version recovery | Verified locally | Core independent; versions/delete marker/selected bytes | Runbook reviewed | Pending | AWS recovery IAM not established |
| Collector/ORS/AI outage boundaries | Verified locally | Unreachable OTLP; route503; safe AI SSE error; core available | Runbooks reviewed | Pending | Provider DI is not live outage timing |
| Logical backup/restore | Verified locally | Fresh DB;20 table fingerprints;journal15;DML API session/search | Recovery procedure documented | Pending PITR | Local dump is not RDS RPO/RTO proof |
| Realtime load/rolling API restart | Verified locally | 100 sockets/two nodes; invalidation/fresh auth/join/refetch | — | Pending | Local topology only |
| API/worker graceful drain | Verified locally | Active request/job completes without SIGKILL | — | Pending ALB/ECS | Cloud stop/deregistration timing unverified |
| k6 core HTTP qualification | Verified locally | [Accepted profiles and resources](./capacity.md) | Hosted capacity review pending | Pending | No production user maximum |
| SLO compliance/history | Pending external environment | Objectives/rules/config tests | Alert routing/on-call pending | Not performed | No 30-day history/network SLI compliance |
| AWS network/TLS/secure cookies/WSS | Pending external environment | Terraform/static assertions | Staging two-replica QA pending | Not performed | Not Verified in AWS |
| RDS PITR / RPO / RTO | Pending external environment | Local logical restore | New-private-instance runbook | Not performed | Objectives unverified |
| S3 AWS version recovery | Pending external environment | Emulator versions/bytes | Version/IAM reconciliation runbook | Not performed | Emulator not AWS proof |
| ElastiCache TestFailover | Pending external environment | Local outage/reconnect | Explicit disposable runbook | Not performed | Never an incident-repair command |
| ECS circuit-breaker bad-revision rollback | Pending external environment | Workflow policy/drain tests | Dedicated-service rollback runbook | Not performed | Never break live users |
| Migration failure rollout protection | Verified locally | Actual deploy shell/fake AWS: exit42 => zero updates | — | Pending | No actual deployment claimed |
| Hosted CI/GHCR/protection | Verified in GitHub | Mandatory `main` Gate + immutable web/API/migrate SHA images for `6603ada...` | `Protect main`, Immutable Releases and private reporting enabled | GitHub-hosted; not AWS | Tag CI has not run; no tag/release exists |
| Base-image vulnerability debt | Known limitation | Trivy0.74: 49 unfixed HIGH/CRITICAL Debian findings/image; Node findings 0; fixable HIGH/CRITICAL 0 | Named risk decision/re-scan required | — | Not a clean-image/non-exploitability claim |
| Live OpenAI/MapTiler/ORS browser smoke | Pending external environment | Deterministic boundaries only | Restricted keys/approval required | Not performed | No paid/live provider calls |
| WAF/CDN/RDS Proxy | Known limitation | Existing app controls/budget tests | Deferral review documented below | Not deployed | Reconsider only with measured need |

## Reproduce safely

```bash
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm test:e2e
pnpm readiness:unit
pnpm readiness:test
K6_BINARY=/absolute/path/to/k6 pnpm perf:load smoke load
K6_BINARY=/absolute/path/to/k6 pnpm perf:load stress soak
pnpm migrations:safety
```

Do not run two readiness stacks concurrently: their disposable ports are web
3310, API 4410–4413, PG 15431, Redis 16381 and S3 14561. Real migrations apply
twice. Application traffic uses a non-owner role. Next builds happen in an
isolated source copy so the user's `apps/web/next-env.d.ts` is not rewritten.
`scripts/readiness/test-api.mjs` replaces external providers through Nest DI,
not business persistence or production debug routes. Normal product images
exclude all readiness scripts, browser/load harnesses and report artifacts.

Ignored local `readiness-results/stack.json` and `load-fixture.json` contain
disposable credentials/session cookies: mode 0600, never upload or commit.
Only compact non-sensitive summaries and failure-only browser evidence belong
in CI artifacts. Failure traces can contain private UI/cookie data; restrict
artifact access and keep seven-day retention. Runtime/qualification summaries
retain at most fourteen days. Temporary snapshots can be removed by the
operator after inspection; no broad temp-directory cleanup is automated.

## Timeouts, retry and backpressure audit

| Boundary | Bound / behavior |
| --- | --- |
| API business PG pool | max 10; idle 30s; acquisition/connect 2s; SQL statement deadline is not globally imposed |
| Worker / migrator pools | max 4 / 1; worker concurrency 5; explicit worker task count |
| Readiness | own max-1 pool, 500ms connect/query/statement limits; concurrent callers share one probe |
| ORS | 9s AbortSignal; controlled 503; no automatic browser retry loop |
| OpenAI SDK / whole SSE turn | 45s configured request + outer turn deadline; SDK maxRetries 1; Stop/disconnect aborts |
| S3 HEAD/Delete | 10s total AbortSignal across SDK retries; presign TTL 10m upload / 5m download |
| Cleanup retry | eight attempts, 5s exponential backoff; bounded retention, durable PG outbox and idempotent completion |
| Redis realtime reconnect | bounded backoff up to 5s; fresh session authorization/join, no state-recovery bypass |
| Realtime Redis shutdown | quit drains publications; 2s deadline then disconnect; ignored upstream ephemeral PUBLISH rejection observed locally |
| ALB / Socket.IO | ALB idle 120s; default ping interval 25s + timeout 20s; SSE max 45s is below ALB idle |
| ECS drain | API/web stop 60s; worker/migrate 120s; ALB deregistration precedes stop |

No hot-loop retry was added. S3 SDK retries are bounded by operation cancellation;
BullMQ/Streams redis reconnect remains required but does not hold business
transactions open. Pool acquisition backpressure is bounded; increasing a pool
without measuring RDS capacity is forbidden. Long-running business SQL can still
require a separately reviewed statement-timeout policy. A laptop drill does not
verify an ALB's actual drain, NAT behavior or provider timeout in AWS.

## Infrastructure decisions

Keep bounded web/API CPU target tracking: min 2 / max 4, target 60%, scale-out
cooldown 60s, scale-in 300s, rolling maximum 200%. No speculative scaling change
was justified by laptop measurements. CPU target tracking cannot react fast
enough to every sudden burst; verify hosted latency/pool alarms before tuning.
Workers remain explicit-count, concurrency 5, not CPU autoscaled: backlog age,
failure rate and durable recovery are the decision inputs.

Default DB budget = `4 * 2 * (10 + 1) + 1 * 2 * 4 + 1 + 20 = 117`.
The extra API connection is the readiness pool. Record actual RDS limit and
other consumers, leave headroom, then set `verified_database_max_connections`.
Terraform blocks the API definition if a supplied limit is exceeded; null is
explicitly unqualified, not evidence that RDS can sustain 117. RDS Proxy stays
deferred until connection churn/saturation is observed.

WAF: retain app validation, CSP, browser mutation policy and distributed rate
limits. Add a scoped WAF after measured abuse/edge-exhaustion or compliance need,
with false-positive QA for login, S3 signing and SSE; it does not replace RBAC.
CDN: no authenticated response/assistant/document caching. Consider an immutable
public-static-asset CDN after geographic latency/egress evidence; preserve
build-origin/CSP constraints. Direct private S3 transfers stay signed and private.
No WAF, CDN, canary, blue/green deployment or proxy was added speculatively.

## Release boundary

Use [release checklist](./release-checklist.md), [SLO](./slo.md),
[capacity](./capacity.md) and [incident runbooks](./runbooks/README.md).
Local green gates qualify the source for the next stage; they do not waive
operator-owned AWS/AT/live-provider checks or authorize destructive cloud drills.
