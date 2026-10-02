# Stage 31 qualification report

Date: 2026-10-03 Europe/Moscow (evidence timestamps: 2026-10-02 UTC).
Source changes are qualified locally; AWS/AT/live-provider
items remain explicitly pending. This is not a declaration of production SLO
compliance. Completion items follow the Stage 31 request numbering.

## Implementation and browser (1–21)

1. Implemented release harnesses/gates, bounded PG readiness/pools, dedicated
   app-secret references, S3 operation deadline, migration review, operational
   smoke, runbooks/SLO/release matrix and five browser-discovered UI/CSP fixes.
   Targeted upstream ephemeral-publication handling and bounded Redis drain;
   stable loopback integration listeners and timestamp-safe metrics assertion.
   No new AI product feature, fake production route, cache or scaling redesign.
2. Playwright **1.63.0**, exact root devDependency and lockfile.
3. k6 **v2.3.0**, official archive checksum-verified; CI installer pins version.
4. E2E: real PG/Redis/S3, migrations twice, compiled Nest with provider-only DI,
   production-built Next, unique users/Trips, independent cookie jars, one worker,
   retries 0, trace/video retained and screenshot only on failure.
5. macOS arm64, Node 24.18.0/pnpm 12.3.4, Chromium Chrome for Testing
   153.0.8010.12 (Playwright browser revision 1243); Next 16.3.6. Hosted Node
   24.21.0 runner qualification remains pending.
6. Register/login/reload/logout/Back: passed; real cookie HttpOnly and unavailable
   to document.cookie; authenticated `/me` becomes 401 after logout.
7. Trip create/open/edit/dashboard: passed with forms and cleanup.
8. Owner/viewer/editor contexts: passed; viewer mutation 403, upgrade restores
   editing, revoke triggers redirect and authoritative 404.
9. Actual mouse pointer drag reorders same-Day items; authoritative API and reload
   confirm order. Not inferred from Move.
10. Space/arrows keyboard DnD and non-drag cross-Day Move passed; focus/persistence
    assertions. Hidden Day drop-zone tab stop fixed without weakening keyboard DnD.
11. Train creation/ferry subtype edit/list and real API result passed.
12. Two-user expense 12345 minor USD: equal shares 6172/6173, custom 2345/10000,
    API settlement member→owner 10000 and formatted $100.00 passed.
13. Real presigned local-S3 browser PUT, complete, byte-equal API/browser download
    and document delete passed; no mocked storage business response.
14. Two accounts/tabs: notification generation/badge, read-all, mark unread/read
    and other-tab convergence passed.
15. Persisted item search, resource filter, navigation and no-results passed.
16. Cross-user live Trip refresh, role/revoke behavior and offline/reload access
    removal passed; separate two-node/restart harness below.
17. Provider-only deterministic assistant: conversation, SSE, Stop with confirmed
    server cancellation, inert preview, explicit Apply/Dismiss, viewer disabled
    Apply and owner unable to read viewer's private conversation passed.
18. Six critical screens emitted zero app CSP violations. Zod eval capability
    probe fixed with jitless side-effect configuration, no unsafe-eval/CSP relaxation.
19. axe **4.13.0**, six screens, WCAG 2A/AA, 2.1AA, 2.2AA: zero violations in
    accepted Chromium run. Anchor cascade contrast issue fixed, not ignored.
20. 320/375/768px no horizontal page overflow; keyboard mobile menu/focus return,
    place combobox selection, composer Ctrl+Enter and skip link passed.
21. VoiceOver + Safari and actual 200%/400% browser zoom not performed; human
    qualification pending. Viewport emulation is not native browser zoom or AT.
    Long repeated upload/cancel Blob/XHR resource profiling remains a limitation.

## HTTP and realtime load (22–34)

22. Bounded fixture: 20 users/Trips, 420 Days, 3360 items, 480 reservations,
    960 expenses/shares, 320 document metadata (no bytes), 400 notifications;
    session once, ANALYZE/generated FTS, 80% reads/20% bounded writes, 100ms think.
23. Smoke 2 VU × 1m: PASS, 1076 requests, 17.904 RPS, p95 16.436ms,
    p99 131.695ms, unexpected 5xx/network 0%, success 100%.
24. Load 20 VU × 10m: PASS, 106686 requests, 177.791 RPS, p95 23.023ms,
    p99 215.614ms, unexpected 5xx/network 0%, success 100%.
25. Stress targets 25/50/75/100, 2m linear ramps each (8m): PASS, 207679 requests,
    432.568 mean RPS, p95 33.774ms, p99 326.314ms, errors 0%. Mean RPS is not peak;
    target 100 is reached at ramp end, not held for two minutes.
26. Soak 20 VU × 30m with 100 simultaneous authenticated sockets: PASS,
    327214 requests, 181.779 RPS, p95 20.483ms, p99 90.305ms, errors 0%, checks100%.
    Actual k6 duration 1800.068s; accepted dedicated repeat, not interrupted JSON.
27. Accepted profile RPS as above; no calculated production user maximum.
28. Core server HTTP candidate p95 <500ms, p99 <1000ms; all completed accepted
    profiles pass. Final stress maximum HTTP request 948.126ms; thresholds use
    the actual request distribution, not iteration duration including think time.
29. Completed accepted HTTP profiles have zero unexpected/network/5xx errors and
    100% successful checks. Earlier invalid fixture attempts (bad notification
    payload/query) failed and were corrected/excluded, never capacity evidence.
30. No threshold breakpoint reached through tested stress target 100 VU. Higher
    capacity and first production bottleneck remain unknown; no speculative tuning.
31. Apple M1/8 CPU/16 GiB, Docker VM 8 CPU/4109803520 bytes, Node 24.18.0;
    full accepted soak: API CPU one-core p50 18.922%/p95 25.877%/max59.036%,
    RSS139.859–285.719 MiB, heap53.329–125.982 MiB; 2617 GC events/2105.148ms.
    Event-loop 1s-window p99 values p50 22.790ms/p95 67.076ms/max152.568ms
    (20ms monitor resolution), not a request-latency percentile. Details below.
32. Real pool pressure max10, final drill peak waiting40, final zero. Soak pool
    total<=10, waiting median/p95=0/max19; normal idle eviction reaches total/idle/
    waiting=0 in 29537ms before shutdown. Cloud pool budget below.
33. 100 sockets/two APIs: all joins/invalidations passed, final single convergence
    observation 17ms, fresh reconnect/rejoin, no listener warnings. Sustained
    Accepted 30m single-node companion: 100 joins, connected/listeners100 in all
    179 ten-second samples, failures0/reconnects0, 163550 invalidations. Sustained
    resource observations are separate from two-node/restart proof.
34. 120 durable cleanup rows survived worker stop/Redis FLUSHDB; final drain 31.211s,
    ~3.845 rows/s including dispatcher wait, failed 0. Not raw S3 delete capacity.

## Readiness, recovery, delivery (35–62)

35. `/health`: liveness 200. `/ready`: bounded PostgreSQL-only 200 ready / 503
    not_ready, no dependency details. Concurrent callers share one max-1 probe.
36. ALB API target `/ready`, web `/health`; actual cloud target behavior pending.
37. Configured pool max/idle/acquisition: API 10/30s/2s, worker 4/30s/2s,
    migrator 1; readiness max 1, connect/query/statement 500ms, idle 5s.
38. Default peak `4*2*(10+1)+1*2*4+1+20=117`; Terraform tests default and
    rejects supplied limit 100. Actual RDS SHOW max_connections/headroom pending.
39. PG stop: liveness 200, readiness 503, core safe 500, process survives.
40. PG restart: readiness/core recover automatically; no manual app DB reset.
41. Redis stop: readiness/core reads stay available; protected login 503 fail-closed.
42. Redis reconnect/PONG and core resume; no readiness dependency added.
43. Disposable Redis FLUSHDB did not erase PG outbox; queue rebuilt/drained.
44. Worker restart drains 120 rows with zero failed; oldest age rises during stop
    then falls. Deterministic job IDs and completed-row noops preserve responsibility.
45. S3 stop: storage call fails, PG/core/ready unaffected; emulator restarts.
    HEAD/Delete total deadline now 10s across SDK retries; real AWS outage pending.
46. Unreachable OTLP collector: 20 instrumented core requests, ready 200 and
    process alive; exporter is not business/readiness dependency.
47. ORS DI failure + actual route POST returns controlled 503; persisted list/core
    remain available, no new route row. Saved-route regression also remains green.
48. AI moderation/provider DI failure yields safe SSE error, no mutation/core outage;
    no live OpenAI qualification claimed.
49. ORS 9s; AI request/outer turn 45s + maxRetries 1; S3 HEAD/Delete 10s;
    cleanup 8 attempts/5s exponential; bounded Redis reconnect. No hot loop or
    business transaction held over provider I/O. Global SQL statement bound remains
    a separately reviewed policy; readiness SQL is explicitly bounded. Separate
    ten sequential Argon2 logins: mean27.143ms/p95=max31.788ms, local test limiter
    disabled; not a login-capacity/security-limiter or production latency claim.
50. Fresh logical pg_dump/restore: all 20 tables/fingerprints equal; nonempty users,
    membership, Days/items, transport reservation, expense/shares, ready document,
    notifications, AI conversation/turn/applied proposal; journal 15 unchanged;
    restored session/search/transport verified through DML-role API, not admin API.
51. RDS RPO objective <=5min, unverified cloud.
52. RDS RTO objective <=60min, unverified cloud; includes verified app usability.
53. PITR/new-private-instance/TLS/LatestRestorableTime/network/verification/cleanup
    and pre-migration snapshot instructions: `runbooks/database-restore.md`.
54. Actual RDS PITR not run: no approved account/region/resource/credentials.
    Local logical restore is not evidence for AWS PITR/RPO/RTO.
55. S3 v1/v2/delete marker/current version/selected-version copy and bytes passed
    locally. AWS recovery role and metadata/outbox reconciliation documented/pending.
56. Explicit disposable ElastiCache TestFailover runbook in redis-outage.md;
    account/region/replication-group/shard and approval required, never repair command.
57. Real ElastiCache failover not run; TLS/AUTH/Multi-AZ cloud evidence pending.
58. Previous-digest manual promotion + dedicated bad-revision rollback runbook;
    image rollback does not reverse schema.
59. Real ECS circuit-breaker rollback not run; only disposable service with completed
    baseline may be intentionally broken after explicit approval.
60. Actual deploy workflow shell + fake AWS exit 42 prevents all service updates;
    exit 0 allows three updates. No real AWS mutation performed by unit tests.
61. Expand/additive schema, bounded resumable migrate/backfill, verify old/new,
    contract only after old tasks/rollback window retire; recovery review required.
62. Conservative SQL checker + SHA-bound reason/compatibility/recovery/reviewer
    metadata, normal CI gate; not a full parser or proof of migration safety.

## Operations, security and handoff (63–98)

63. Core availability objective 99.9%/rolling 30 days; no production compliance claim.
64. Core HTTP latency candidate p95 <500ms/p99 <1000ms; route/provider separation.
65. AI TTFT/duration/tool/tokens and ORS/MapTiler/S3 external latency separate;
    no live-provider SLO established without approved baseline.
66. Error budget 0.001 × eligible requests; time equivalent 43.2m/30 days.
    Unexpected 5xx/network/non-abuse capacity 429 count; intentional 4xx/abusive
    429 excluded. Freeze risky releases on exhaustion/rapid burn; actual SLI and
    multi-window network/burn alert routing still need hosted qualification.
67. Capacity methodology/results/caveats: capacity.md and this report; JSON
    summaries ignored locally, compact safe CI artifacts only.
68. Keep bounded web/API min2/max4 CPU target 60%, cooldown out60s/in300s,
    rolling max200%; worker explicit count/concurrency5. No laptop-driven tuning.
69. Active HTTP request drained 200 on SIGTERM without SIGKILL (~3178ms);
    replacement ready, remaining replica available.
70. Worker active cleanup drained without SIGKILL (~280ms); duplicate completed
    outbox delivery noops. Forced shutdown/cloud task timing not extrapolated.
71. Socket fresh auth/join/refetch after API replacement passed; Redis Streams,
    WebSocket-only, no sticky sessions or stale connection-state recovery bypass.
72. Accepted 1800 API samples: request listeners stay1; RSS median first/last5m
    243.172/199.453 MiB, heap79.215/81.688 MiB; no progressive API RSS exhaustion
    observed. Socket heap median12.422→13.765 MiB (+1.344); small client/harness
    drift remains a longer-run/heap-profile limitation, not proof of zero leaks.
    No browser XHR/Blob leak guarantee inferred.
73. Soak pool total<=10; temporary waiting max19 recovers; final connections and
    waiters zero via normal 30s idle policy before shutdown. No connection leak
    manifested within the measured run; application/readiness shutdown ends pools.
74. Dedicated app DML role: CONNECT/USAGE/table DML/sequences, no superuser/
    CREATEDB/CREATEROLE/REPLICATION/schema DDL; external username/password ARN.
75. Migration schema owner/admin secret separate; optional dedicated owner ARN,
    managed RDS admin fallback only one-off migrate, never API/worker. Operator
    provisioning/owner/default privileges/rotation is not automated Terraform SQL.
76. Real role denies CREATE ROLE/TABLE, ALTER/DROP TABLE, DROP SCHEMA and DROP
    DATABASE; normal CRUD/worker, advisory transaction + row locks succeed in
    final drill. No destructive production privileges exercised.
77. WAF deferred pending abuse/compliance evidence and false-positive tests;
    CSP/RBAC/validation/shared limiting retained, not a WAF substitute claim.
78. CDN deferred pending geographic/egress evidence; no private authenticated/
    assistant/S3 response caching. Immutable public-static assets only candidate.
79. Nine required incident runbooks + index; SEV1 core/data/security, SEV2
    optional degradation/backlog, SEV3 isolated minor. Safe explicit targets,
    diagnosis, mitigation, escalation, recovery/evidence/cleanup guidance.
80. Release checklist spans source/CI, browser/AT, security/migrations/backups,
    capacity/drain, AWS deploy/observability/smoke/rollback and named exceptions.
81. Mandatory Chromium + checksum-k6 smoke CI job joins aggregate Gate;
    retries0, failure-only browser evidence7d, smoke summary7d, no PR secrets.
82. workflow_dispatch Release qualification on disposable runner, heavy profile
    choice, local drills, summaries14d; no AWS credentials/destructive schedule.
83. Production audit, secret scan and security regressions passed; no relaxed
    runtime policy/AI privacy. Final candidate regression rerun recorded below.
84. Component/JSDOM a11y + real-browser axe/keyboard/reflow passed; human AT/
    actual zoom remain explicit, not waived by automation.
85. All ten bundle budgets/perf tests passed after fixing Zod namespace tree-
    shaking regression; budgets unchanged. HTTP completed profiles pass.
86. Observability config/rule fixtures/tests passed; collector unavailable stays
    fail-open for business. No private-content/identity metric labels introduced.
87. Deterministic ai:test/ai:eval + privacy/RBAC/Apply regression passed; no live key.
88. Terraform1.16.4/AWS6.66.0 fmt/init/validate passed; bootstrap1 and production2
    mock tests pass; Trivy config HIGH/CRITICAL0, LOW22/MEDIUM2 remain reported.
    Image vulnerability inventory is separate below; no clean-image claim.
89. Real Testcontainers integration and check:full passed; cloud integration pending.
90. All 25 isolated gate commands passed in `readiness-results/release-final/gates.json`;
    final Chromium/drills and smoke/load/stress use that label. Interrupted soak
    is excluded; its dedicated repeat uses `readiness-results/release-soak/`. Earlier failed
    snapshots were investigated, not relabelled as passing. Next-env preserved.
91. Compose base+observability validation, production image build and own-network
    migration-twice/API health+ready/auth/Trip/web smoke passed. Final image IDs/
    tooling exclusion and vulnerability inventory below; user containers untouched.
92. No real AWS apply/deploy/PITR/TestFailover/bad-revision rollback; explicit
    operator credentials/targets/domains/approval needed. Not Verified in AWS.
93. New production-readiness/SLO/capacity/release checklist/report/runbooks;
    README/testing/performance/AWS/CI/security/observability/manual-a11y docs updated.
94. Remaining debt: real AWS TLS/WSS/IAM/role/backup/failover/rollback/observability,
    RDS limit/headroom/RPO/RTO, hosted CI/GHCR/protection, live restricted providers,
    human AT/zoom, browser resource profiling, small socket-client heap drift,
    RUM and complete network/burn SLIs;
    unfixed base-OS findings require named release-owner review/exception.
95. Changed-file scope: readiness controller/service + DB/S3 config/tests; small
    web contrast/layout/focus/Zod/composer fixes; e2e/config/dev lock; local readiness/
    k6/CI harness; role bootstrap; production Terraform; workflows and named docs.
    Exact file list is in the Changed files appendix and the qualified commit's
    `git show --name-only` (no next-env).
96. No new SQL migration/name/hash. Existing committed chain remains 15 entries;
    db:generate/check + apply twice/journal/restore verification passed.
97. Separate user file apps/web/next-env.d.ts remains unstaged/uncommitted with SHA
    `0f70629890b72a0a82e91972cc032c04b658b26c265373cb711cf576bfbf8fcc`.
98. Commit message `feat: qualify Stage 31 production readiness`; actual final
    hash supplied in delivery (a committed document cannot embed its own hash).

## Final container evidence

Local arm64 image IDs, not registry manifest digests or AWS deployment evidence:

| Image | ID (sha256) | Bytes |
| --- | --- | ---: |
| API / worker | `12bc220a40f864d7d1ecec57989a948f226c44d146a6fcc1372d4291aaf5447e` | 383747230 |
| Migrator | `bfa0b457388950275aeef3329a23d21763580ff175b237ef7bcec4f37b835c8f` | 384417310 |
| Web standalone | `81d39a500771e71c238f3132db34622f4884c0feb0fe501a75d053148b30de9b` | 320526807 |

Final own-network container smoke passes migration twice, API health/ready,
registration/session/Trip and web health. Runtime image inspection cannot resolve
Playwright/axe/Testcontainers or find readiness/e2e/performance/evidence directories.
Real worker artifact is exercised in the compiled worker drills.

Trivy **0.75.0**, cached publicly downloaded vulnerability DB, final three image
IDs: each Debian 12.15 image reports **LOW75 / MEDIUM102 / HIGH53 / CRITICAL4 /
UNKNOWN2 package findings**, no runtime npm HIGH/CRITICAL and no fixable image
HIGH/CRITICAL. HIGH/CRITICAL records have no FixedVersion in this scanner data;
they are not 57 unique CVEs and are not accepted as harmless/non-exploitable.
Existing CI Trivy0.74.0 reports all and blocks fixable HIGH/CRITICAL; no ignore
entry/exit-policy relaxation introduced. Release owner must review vendor status,
runtime exposure/mitigation and approve a named exception or block production,
then re-scan the immutable candidate with fresh data. Infrastructure config scan
is separate (HIGH/CRITICAL0, LOW22/MEDIUM2), not an image-vulnerability result.

Operational smoke also passed against actual standalone web and compiled API:
read-only health/ready leaves session/Trip counts unchanged; acknowledged
pre-provisioned disposable account creates/reads/deletes only its new Trip and
logs out. Account retained; own service containers removed.

## Accepted capacity resource evidence

Final soak runs 2026-10-02 21:22:24.930–21:52:26.918 UTC
(2026-10-03 00:22–00:52 Europe/Moscow); normal pool idle recovery follows before
API shutdown. `readiness-results/release-soak/` contains capacity, k6, socket and
runtime summaries. Source functional code is unchanged from the accepted gates,
Chromium and drill candidate; later edits are documentation only.

| API observation | First 5m | Minutes 10–15 | Last 5m |
| --- | ---: | ---: | ---: |
| RSS median MiB | 243.172 | 236.188 | 199.453 |
| Heap median MiB | 79.215 | 81.283 | 81.688 |

1800 one-second API observations cover the coordinated measurement. CPU uses
process CPU-time deltas normalized to one core, not the entire 8-core host.
GC duration sums reset-per-interval observations, not repeated cumulative values.
Stable listener counts are HTTP request listeners1 and client invalidation
listeners100, not a heap-snapshot proof about every server/browser allocation.
Socket client RSS55.875–116.375 MiB, heap11.817–17.135 MiB; first/last5m RSS
medians71.391/56.766 MiB, heap12.422/13.765 MiB. No connection/listener exhaustion
occurred; the +1.344 MiB client heap drift requires longer heap profiling before
claiming no retained-memory leak. Fixtures/providers/browser resources differ
from a real deployment, so no production maximum or universal leak guarantee.

Earlier accepted smoke/load/stress summaries are in `release-final/k6-*.json`.
Continuous resource samples for that chain were lost at user-turn interruption,
so no complete CPU/RSS claim is made for those three profiles. Two read-only
owned-container snapshots remain in `release-final/docker-observations.json`:
PG CPU95.95%/RSS85.26 MiB during load, CPU112.06%/RSS86.89 MiB in the last stress
ramp; Redis CPU0.71%/1.69% and RSS9.52/10.02 MiB; local S3 CPU0.08%/0.04% and
RSS141.4/141.5 MiB. These are point-in-time Docker one-core CPU observations,
not peaks or host-wide utilization. They suggest DB work merits hosted profiling,
not that the first production bottleneck has been identified.

Excluded attempts: the first independent socket companion lost API availability
for its final95s because its HTTP launcher shut down early; it failed and is not
accepted. The subsequently coordinated full chain was interrupted by the user
turn before soak finished (`incomplete:true`), also excluded. Only the completed
coordinated soak-only repeat supplies final 30-minute acceptance/resource data.

## Changed files

The qualified Stage 31 commit contains these 101 paths. The separate user
`apps/web/next-env.d.ts` modification is excluded; generated evidence is ignored.

```text
.dockerignore
.github/workflows/ci.yml
.github/workflows/deploy-aws.yml
.github/workflows/readiness.yml
.gitignore
README.md
apps/api/src/app.module.ts
apps/api/src/common/configure-application.ts
apps/api/src/config/environment.ts
apps/api/src/config/worker-environment.ts
apps/api/src/database/database-config.spec.ts
apps/api/src/database/database-config.ts
apps/api/src/database/database.provider.ts
apps/api/src/migrate.ts
apps/api/src/observability/metrics.service.spec.ts
apps/api/src/readiness.service.ts
apps/api/src/ready.controller.spec.ts
apps/api/src/ready.controller.ts
apps/api/src/realtime/tripforge-io.adapter.spec.ts
apps/api/src/realtime/tripforge-io.adapter.ts
apps/api/src/storage/s3-storage.service.spec.ts
apps/api/src/storage/s3-storage.service.ts
apps/api/src/storage/storage.constants.ts
apps/api/test/auth.integration-spec.ts
apps/api/test/documents.integration-spec.ts
apps/api/test/expenses.integration-spec.ts
apps/api/test/notifications.integration-spec.ts
apps/api/test/reservations.integration-spec.ts
apps/api/test/routes.integration-spec.ts
apps/api/test/search.integration-spec.ts
apps/api/test/security.integration-spec.ts
apps/api/test/trips.integration-spec.ts
apps/web/app/globals.css
apps/web/components/realtime/authenticated-realtime-bridge.tsx
apps/web/components/trips/assistant-screen.test.tsx
apps/web/components/trips/assistant-screen.tsx
apps/web/components/trips/days-section.tsx
apps/web/components/trips/itinerary-item-card.tsx
apps/web/lib/auth/schemas.ts
apps/web/lib/places/maptiler-geocoding.ts
apps/web/lib/realtime/schemas.ts
apps/web/lib/security/zod-csp.test.ts
apps/web/lib/security/zod-csp.ts
apps/web/lib/trips/expense-schema.ts
apps/web/lib/trips/reservation-schema.ts
apps/web/lib/trips/schemas.ts
docs/accessibility-manual-qa.md
docs/aws-deployment.md
docs/capacity.md
docs/ci-cd.md
docs/observability.md
docs/performance.md
docs/production-readiness.md
docs/release-checklist.md
docs/runbooks/README.md
docs/runbooks/ai-provider-outage.md
docs/runbooks/api-unhealthy.md
docs/runbooks/database-outage.md
docs/runbooks/database-restore.md
docs/runbooks/deployment-rollback.md
docs/runbooks/redis-outage.md
docs/runbooks/routing-provider-outage.md
docs/runbooks/s3-failure.md
docs/runbooks/worker-backlog.md
docs/security-hardening.md
docs/slo.md
docs/stage31-qualification.md
docs/testing-strategy.md
e2e/fixtures.ts
e2e/qualification.spec.ts
infra/database/bootstrap-roles.sql
infra/terraform/production/alb-dns.tf
infra/terraform/production/database-budget.tf
infra/terraform/production/ecs.tf
infra/terraform/production/iam.tf
infra/terraform/production/locals.tf
infra/terraform/production/terraform.tfvars.example
infra/terraform/production/tests/architecture.tftest.hcl
infra/terraform/production/variables.tf
package.json
performance/k6/core.js
playwright.config.ts
pnpm-lock.yaml
scripts/ci/container-smoke.sh
scripts/ci/workflow-policy.mjs
scripts/readiness/deployment.test.mjs
scripts/readiness/fixture.mjs
scripts/readiness/gates.mjs
scripts/readiness/install-k6.mjs
scripts/readiness/load.mjs
scripts/readiness/migration-approvals.json
scripts/readiness/migration-safety.mjs
scripts/readiness/operational-smoke.mjs
scripts/readiness/operational-smoke.test.mjs
scripts/readiness/qualify.mjs
scripts/readiness/safety.mjs
scripts/readiness/safety.test.mjs
scripts/readiness/serve.mjs
scripts/readiness/socket-soak.mjs
scripts/readiness/stack.mjs
scripts/readiness/test-api.mjs
```
