# Portfolio evidence index

[Overview](../README.md) · [Case study](./portfolio-case-study.md) · [Interview guide](./portfolio-interview-guide.md)

This is a claim-to-evidence map, not a claim that every configured system has run
in production. Stage 31 is the retained baseline; Stage 32 packages that evidence
and reruns relevant regressions without repeating the long load qualification.

**Current exception:** one unfixed HIGH in the ESLint-only dependency chain
(`braces`, GHSA-vfj7-8cjw-p6xm) has an exact, expiring non-production exception
after final-artifact reachability checks. `security:audit` is green under that
policy and still rejects every unexpected HIGH/CRITICAL. See the
[current verification report](./stage32-verification.md); this is not a claim that
the advisory disappeared or that container base images are vulnerability-free.

## Reading the status labels

- **Verified locally:** executed on the documented local environment; not a cloud SLO.
- **Verified in Chromium:** actual browser interaction, not Safari/assistive-technology certification.
- **Verified with PostgreSQL/Testcontainers:** actual database behavior, not mocks alone.
- **Configured for AWS:** architecture/workflow/config exists; effective cloud behavior is unproven.
- **Pending AWS qualification / Pending live-provider qualification / Manual QA pending:** explicitly unfinished work.

## Claims, sources and scope

| Claim | Status / evidence | Representative implementation | Boundary / follow-up |
| --- | --- | --- | --- |
| Opaque cookie sessions, immediate revoke, current RBAC | Local + Chromium + PG: [authentication](./authentication.md), [E2E](../e2e/qualification.spec.ts) | [Session service](../apps/api/src/auth/session/session.service.ts) | Stateful lookup; cookies do not replace membership checks |
| Server shell with recoverable client interactions | Local + Chromium: [server state](./server-state.md) | [Itinerary card](../apps/web/components/trips/itinerary-item-card.tsx) | Form state stays separate from background query data |
| Realtime invalidates; REST repairs gaps | Local: [realtime](./realtime.md), [Stage 31](./stage31-qualification.md) | [Publisher](../apps/api/src/realtime/trip-realtime.publisher.ts) | Two nodes / 100 clients / one 17 ms observation is not p99 |
| Durable cleanup survives Redis loss | Local + PG: [background jobs](./background-jobs.md), [drills](../scripts/readiness/qualify.mjs) | [Dispatcher](../apps/api/src/background-jobs/cleanup-outbox-dispatcher.service.ts) | At-least-once; signed capabilities can outlive metadata until expiry |
| Notifications are transactionally durable | PG: [notifications](./notifications.md) | [Transactional writer](../apps/api/src/notifications/notification-writer.ts) | Socket loss can delay freshness, not erase a committed notification |
| Private direct file transfer, HEAD finalize | Local + Chromium: [documents](./documents.md), [E2E](../e2e/qualification.spec.ts) | [Document service](../apps/api/src/trips/trip-documents.service.ts) | S3 emulator, not effective AWS IAM; MIME is not malware scanning |
| Permission-scoped FTS/trigram search | PG: [search](./search.md), [plans](./performance.md) | [Search repository](../apps/api/src/trips/trip-search.repository.ts) | Historical warm SQL median 0.815 ms / 37 rows; not HTTP latency |
| Exact minor-unit expense arithmetic | PG + Chromium: [expenses](./expenses.md), [E2E](../e2e/qualification.spec.ts) | [Expense service](../apps/api/src/trips/trip-expenses.service.ts) | Per-currency balances; no synthetic FX grand total |
| Non-drag Move, keyboard and responsive flows | Chromium: [accessibility](./accessibility.md), [manual checklist](./accessibility-manual-qa.md) | [E2E](../e2e/qualification.spec.ts) | Six axe screens; VoiceOver/Safari/native zoom pending |
| Initial-route bundle boundary improvements | Local: [performance](./performance.md), [budget checker](../scripts/performance/check-bundle-budget.mjs) | [Web sources](../apps/web) | Historical Stage 25 bytes, compiler-specific; field Web Vitals pending |
| Layered mutation/RBAC/CSP defenses | Local + PG + Chromium: [security](./security-hardening.md) | [Mutation guard](../apps/api/src/auth/browser/browser-mutation.guard.ts) | Not “100% secure”; unfixed OS findings remain release debt |
| Request-to-trace diagnostics with bounded labels | Local: [observability](./observability.md), [overhead context](./performance.md#observability-overhead) | [Observability scripts](../scripts/observability) | No RUM; tiny health microbenchmark is not representative workload cost |
| Trusted immutable publishing and migration-before-rollout | Local policy/shell tests: [CI/CD](./ci-cd.md) | [CI](../.github/workflows/ci.yml), [deploy](../.github/workflows/deploy-aws.yml) | Hosted execution, registry and repository protections pending |
| ECS/RDS/ElastiCache/private S3 mapping | Configured for AWS: [AWS](./aws-deployment.md) | [Terraform](../infra/terraform) | Mock/static checks are not plan/apply/IAM/PITR/failover proof |
| Read-only AI tools and explicit proposal approval | Local + PG + Chromium: [AI](./ai-assistant.md) | [Provider](../apps/api/src/ai/openai-client.service.ts), [Apply](../apps/api/src/ai/ai-proposals.service.ts) | Deterministic provider; `store:false` is not Zero Data Retention |
| Local capacity and resilience qualification | Local: [capacity](./capacity.md), [canonical 98-item report](./stage31-qualification.md) | [Load scripts](../scripts/performance), [recovery drills](../scripts/readiness/qualify.mjs) | No production maximum / achieved SLO / AWS restore claim |

## Accepted Stage 31 measurements

The [canonical report](./stage31-qualification.md) carries environment, dataset,
thresholds, failed attempts, exact commands and caveats. Short extracts:

| Profile | VUs / duration | Requests / mean RPS | HTTP p95 / p99 | Unexpected errors / checks |
| --- | --- | --- | --- | --- |
| Smoke | 2 / 60.098 s | 1,076 / 17.904 | 16.436 / 131.695 ms | 0% / 100% |
| Load | 20 / 600.063 s | 106,686 / 177.791 | 23.023 / 215.614 ms | 0% / 100% |
| Stress | Four 2-minute linear ramps to 25/50/75/100 / 480.107 s | 207,679 / 432.568 | 33.774 / 326.314 ms | 0% / 100% |
| Soak | 20 + 100 authenticated sockets / 1,800.068 s | 327,214 / 181.779 | 20.483 / 90.305 ms | 0% / 100% |

Apple M1, 8 CPU, 16 GiB; Docker VM 8 CPU / 4,109,803,520 B; Node 24.18.0;
PG 18.6, Redis 8.10.1, S3 emulator 4.14.0. Fixture: 20 users/Trips, 420 Days,
3,360 items, 480 reservations, 960 expenses/shares, 320 document metadata rows,
400 notifications. Mix: 80% reads / 20% bounded writes, 100 ms think time,
session acquisition once, no provider calls/file-byte traffic/Argon2 per iteration.
Stress did not hold 100 VUs for two minutes or find a threshold breakpoint.

The 13 recovery drills include PG/Redis failure, outbox recovery, restore and
shutdown. The 120-row outbox drained in 31.211 s including dispatcher wait;
20 logical table fingerprints matched after restore. Pool waiting ended at zero;
100 socket listeners stayed stable. Client/harness heap median drifted
12.422 → 13.765 MiB (+1.344): not proof of a leak, and longer retention-path
profiling is still needed. These are local observations, not AWS RPO/RTO.

## Screenshots and reproducibility

Seven [curated application captures](./portfolio-case-study.md#application-gallery)
use fictional Japan travel data, six 1440×900 desktop views and one 390×844
mobile view. The [opt-in script](../scripts/portfolio/screenshots.mjs) creates a
new disposable stack, refuses non-loopback targets, fixes fixture dates and uses
the existing test-only AI provider. It is not run in CI and never attaches to a
production database. All seven must be visually reviewed after regeneration.

## What evidence does not say

No real deployment URL, production traffic, availability history, maximum user
count, achieved Web Vitals, security certification or manual-all-code authorship
is asserted. A configured workflow is not a hosted run. OS package findings are
not automatically exploitable, harmless or unique CVEs. See the
[publication checklist](./portfolio-publication-checklist.md) and
[release checklist](./release-checklist.md) for remaining owner decisions.
