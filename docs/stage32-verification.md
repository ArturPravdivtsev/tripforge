# Stage 32 — portfolio implementation and verification

Date: October 3, 2026. Baseline: Stage 31 commit `3716c80`.

The portfolio package is implemented. **Current regression status: 25 of 26
gates passed; dependency audit is BLOCKED**, not green. Chromium E2E separately
passed 12/12 without retries. No audit exception, dependency downgrade or
runtime behavior change was made to manufacture a pass.

`security:audit` reports HIGH `braces` <=3.0.3 through
`packages/eslint-config → eslint-config-next → @next/eslint-plugin-next →
fast-glob → micromatch → braces`. The
[reviewed advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) was updated
October 2, 2026 and lists no patched version. This reported path concerns lint
tooling; it does not itself demonstrate remotely exploitable application behavior.
The unchanged workspace-wide audit nevertheless blocks. Dependency remediation
or an owner-reviewed policy decision is separate from the documentation scope.
Historical Stage 31 audit/image results remain dated evidence, not today's clean bill.

## Commands and retained results

Qualification builds run in disposable source copies so Next cannot rewrite the
owner's local generated file. Raw logs/stack descriptors remain ignored under
`readiness-results/`; public docs contain only scoped summaries, not local paths,
raw sessions or fixture database URLs.

```bash
READINESS_RUN_LABEL=stage32-final node scripts/readiness/gates.mjs
READINESS_RUN_LABEL=stage32-e2e pnpm exec playwright test
PORTFOLIO_BASE_URL=http://127.0.0.1:3310 READINESS_RUN_LABEL=stage32-captures-final pnpm portfolio:screenshots
READINESS_RUN_LABEL=stage32-quickstart pnpm readiness:serve
pnpm docs:check
git diff --check
```

| Gate group | Actual result |
| --- | --- |
| Frozen install, DB generate/check, migrations safety | PASS; no migration generated |
| Lint / typecheck / unit / coverage | PASS; 310 API + 279 web + 2 UI unit tests |
| Component accessibility | PASS; 73 tests across 12 files |
| `security:audit` | **FAIL: 1 HIGH braces; no patched version; no suppression** |
| Secret scan / security regression | PASS; worktree patterns and security suites |
| Build / check / check:full | PASS; production Next 16.3.6/Webpack/API/shared builds |
| PG/Testcontainers integration | PASS; 98 tests across 13 files |
| Performance | PASS; 10 bundle budgets and performance-script tests |
| Observability | PASS; config plus 22 API / 3 web tests |
| AI | PASS; 30 regression tests / 11 deterministic evaluation cases |
| Peers / workflow policy / readiness unit | PASS; docs step is blocking and policy-tested |
| Chromium E2E, separate from 26 gates | PASS; 12 scenarios, no retries, production-built local stack |
| Terraform fmt / validate / mock tests | PASS; bootstrap 1 / production 2 tests |
| Trivy IaC HIGH/CRITICAL policy | PASS; zero tested HIGH/CRITICAL misconfigurations |
| Long k6 / 13 recovery drills | Not rerun for docs-only changes; retained Stage 31 evidence |
| Docker application image rebuild | Not rerun; no Dockerfile/runtime changes; test stacks used Docker dependencies |
| AWS / live providers / manual AT | Pending; not claimed as executed |

The README quick-start was exercised using a source-copy frozen install, existing
Chromium installation, `pnpm readiness:serve`, real browser registration and
Trip navigation through Playwright MCP. Corepack shims were enabled in an owned
temporary directory rather than changing the host's global shims. The launcher
built from source and migrated twice. An unauthenticated `/auth/me` 401 and missing
favicon 404 in the browser console were observed, not hidden as an all-console-clean claim.
Clean-checkout compatibility was also tested in a new owned Git/source copy with
the original tracked `next-env.d.ts` (SHA-256
`1862ac4bbbc5192d4bf562161df66ea547ed3e67173100656ab606ae9797db2b`). Frozen
install, Chromium check, build/migrations/launcher and MCP registration/navigation
passed; the caller's tracked file remained unchanged through shutdown. The
launcher's former machine-specific SHA guard was replaced by its existing
before/after preservation check; both clean and user-modified files are supported.
The first quick-start process was interrupted by the user after registration;
subsequent inspection found no residual owned stack/listeners. No user containers
were stopped. Native `pnpm dev`/token-dependent full Compose are documented
alternatives, not claimed as freshly qualified here.

## 75-item delivery report

1. **Implementation:** README, case study, evidence map, interview guide,
   publication/local-start docs, seven real captures and offline docs/CI validation.
2. **README:** positioning/status → screenshots → capabilities → engineering
   highlights → architecture → evidence → grouped stack → startup → docs → next step.
3. **One line:** collaborative travel planning with frontend-focused end-to-end ownership.
4. **Status:** unreleased release candidate / portfolio project; no published v1.0/live demo;
   dated Stage 31 success plus today's explicitly blocking dependency audit.
5. **Product:** shared Trips, itinerary, reservations, exact expenses, private files,
   scoped search/notifications/realtime, human-reviewed AI proposals.
6. **Highlights:** eight boundary-focused choices, not a list of every feature.
7. **Root diagram:** browser → Next pages / Nest REST-SSE-sockets / direct S3;
   PG truth, Redis transport, separate worker and optional providers.
8. **Case-study path:** [portfolio-case-study.md](./portfolio-case-study.md).
9. **Structure:** problem/ownership/architecture, frontend/data/realtime/jobs/files/search,
   accessibility/performance/security/telemetry/delivery/AI, qualification, trade-offs,
   limitations, lessons and gallery.
10. **Workflow disclosure:** AI-assisted implementation; no claim every line was
    manually written or that tests substitute for independent human review.
11. **Auth:** opaque hashed DB sessions versus JWT; revocation/current membership
    at the cost of stateful lookups.
12. **Frontend:** server shell/client leaves; Query, forms and transient state have
    separate owners; optimistic rollback and deferred itinerary refetch during drag.
13. **Realtime:** invalidation + authorized refetch versus socket authority; local
    two-node/100-client 17 ms observation is not a production percentile.
14. **Outbox:** atomic PG intent → bounded dispatcher → BullMQ → idempotent S3
    deletion; at-least-once, eventual cleanup, signed-URL expiry caveat.
15. **Notifications:** business rows commit in the originating transaction;
    sockets refresh, not create durability; no unnecessary second queue.
16. **S3:** direct private PUT, pending metadata and HEAD finalize; no API byte proxy,
    no malware-scanning/effective AWS IAM claim.
17. **Search:** parameterized permission-scoped PG FTS/trigram; warm SQL 0.815 ms
    median/37 rows with fixture/sample context, not HTTP latency.
18. **Expenses:** integer minor units, deterministic exact shares/per-currency
    settlement; 12,345 split 6,172/6,173, no invented FX total.
19. **Accessibility:** explicit non-drag Move, keyboard/focus/reflow/axe evidence;
    WCAG target, not certification; manual AT remains pending.
20. **Performance:** historical Stage 25 initial-byte improvements, ten current
    budgets; no field Web Vitals or unjustified optimization claims.
21. **Security:** layered sessions/RBAC/mutation guards/private capabilities/CSP;
    new audit blocker and existing unfixed OS findings remain visible.
22. **Observability:** request ID → safe log → trace → PG/provider span with bounded
    labels; tiny health overhead benchmark is not real-workload overhead or RUM.
23. **Delivery:** pinned actions, untrusted validation, trusted immutable publishing,
    protected promotion and migration-before-rollout; hosted execution not claimed.
24. **AWS:** existing architecture maps to ECS/RDS/ElastiCache/S3; locally validated
    configuration is distinguished from pending effective cloud qualification.
25. **AI:** bounded read-only tools, server scope injection, typed inert proposals,
    explicit Apply/RBAC/idempotency; `store:false` is not Zero Data Retention.
26. **Stage 31:** retained 12 browser scenarios, 13 drills, all four load profiles;
    earlier failed/interrupted attempts are excluded, not relabelled successful.
27. **Failures:** PG health/ready distinction, Redis fail-closed actions/outbox survival,
    worker catch-up; logical restore is not AWS PITR/RPO/RTO.
28. **Trade-off table:** sessions, search, realtime, jobs, files, ECS, RDS, AI and
    evidence-driven optimization versus their rejected/deferred alternatives.
29. **Limits:** cloud/live/AT/field metrics/hosted delivery, OS-risk ownership,
    current braces audit blocker and longer resource profiling.
30. **Heap drift:** 12.422 → 13.765 MiB (+1.344) client/harness median over 30 minutes;
    stable listeners alone do not prove absence of retained objects or identify a leak.
31. **Fixture:** fictional Alex Morgan/Sam Rivera, Japan autumn 2027, Tokyo/Kyoto/Osaka,
    real authorized domain persistence, fixed dates, reserved example.test accounts.
32. **Desktop:** dashboard, itinerary, expenses, reservations, search, assistant;
    six 1440×900 PNGs from actual Chromium UI.
33. **Mobile:** one 390×844 itinerary capture; normal scroll shows readable cards and Move.
34. **Privacy:** every image visually inspected; no real PII/key/session/AWS IDs;
    PNG chunks have no extra text/EXIF metadata; each under 1 MB.
35. **README images:** itinerary + explicit-approval assistant, with meaningful alt
    and a link to the full gallery; no generated marketing mockups.
36. **Mermaid:** root architecture plus case-study architecture/realtime/outbox/
    AI/CI-promotion boundaries; focused diagrams, no invented component.
37. **Evidence index:** [portfolio-evidence.md](./portfolio-evidence.md), claim/status/
    docs/source/caveat mapping and contextual Stage 31 profile table.
38. **Source links:** representative session service, realtime publisher, outbox
    dispatcher/processor, search repository, AI provider/approval, browser tests,
    workflow and Terraform; not an indiscriminate file dump.
39. **Interview path:** [portfolio-interview-guide.md](./portfolio-interview-guide.md).
40. **30-second pitch:** product, frontend-focused ownership, AI assistance and scope.
41. **Two-minute pitch:** product → state boundaries → trade-offs → evidence/limits.
42. **Five-minute outline:** timed UI, frontend, consistency, AI/delivery and failures.
43. **Deep dives:** twelve questions; each includes context, decision, cost,
    supporting evidence and a next qualification step.
44. **CV summary:** proposed project-sized wording only; actual CV/title/employment untouched.
45. **Quick-start:** frozen source-copy install, Corepack temporary shims, Chromium
    install check, production-built disposable launcher, MCP account registration/navigation.
46. **Links:** repository-relative docs/assets/source paths; only external factual
    sources use HTTPS; no workstation file URLs.
47. **Docs checker:** dependency-free Node tests + Markdown scan; local target
    existence, alt text, balanced fences, absolute-path privacy and image bound;
    no network crawl/anchor or full GFM parser claim.
48. **Docs result:** PASS; 53 Markdown files, three docs/screenshot-safety tests.
49. **Local paths:** no private absolute workstation paths in public Markdown;
    ignored logs/descriptors are not copied to the portfolio.
50. **Public audit:** existing secret patterns scanned tracked/unignored text and
    read-only all-ref history patches: zero findings. Visual/PNG privacy review
    complements pattern checks; this is not a guarantee no secret can exist.
51. **License:** none found; owner choice deferred, not invented.
52. **SECURITY.md:** deferred without a real private channel/support policy;
    no fabricated email or public security-report instruction.
53. **Badges:** no guessed CI/license/release/deployment badge.
54. **Claim audit:** local/Chromium/real PG/configured AWS/pending cloud/live/manual
    categories remain distinct; the new dependency audit failure is explicit.
55. **Metrics:** smoke/load/stress/soak, environment/workload, historical bundle/SQL/
    telemetry, restore/outbox/socket/pool evidence with context in the case/index.
56. **Softened claims:** no “production-grade,” battle-tested, maximum users,
    achieved 99.9%/Web Vitals, clean-image/zero-leak/Zero Data Retention or live deployment.
57. **Rendering:** eight documents rendered in Chromium, six Mermaid diagrams
    parsed/rendered and visually inspected; offline checker
    remains intentionally simpler and does not fetch rendering dependencies in CI.
58. **Capture command:** opt-in exact loopback acknowledgement; new owned stack,
    true Live wait, deterministic provider fixture, animations/caret controlled;
    seven final PNGs. Initial invalid train fixture was corrected, not called a pass.
59. **CI docs:** unconditional blocking Quality step plus `ci:quality` and isolated
    gates; workflow-policy test rejects removal/skip/advisory conversion.
60. **Security regression:** suites/secret checks PASS; audit **FAIL, 1 unfixed HIGH**;
    release remains blocked until remediation/owner review, no green aggregate claim.
61. **A11y regression:** 73 component tests PASS; E2E axe/keyboard/reflow/CSP PASS;
    no Safari/VoiceOver/native zoom claim.
62. **Browser regression:** all 12 Chromium E2E PASS without retries (1.2 minutes).
63. **Performance:** ten bundle budgets + script tests PASS; no long k6 repeat for docs.
64. **Observability:** config + 22 API/3 web tests PASS.
65. **AI:** 30 regression + 11 deterministic evaluation cases PASS; live QA not run.
66. **Integration:** 98 tests/13 files plus `check:full` PASS against real PG/Testcontainers.
67. **Terraform:** fmt/validate/bootstrap 1 + production 2 mock tests/Trivy HIGH-CRITICAL PASS;
    no AWS plan/apply or resource mutation.
68. **Build:** fresh isolated production Next/API/shared builds PASS; user's file preserved.
69. **Docker:** no application-image rebuild claimed; original Dockerfiles remain
    unchanged, docs tooling/PNG paths are excluded from context, disposable dependency
    containers actually ran. Stage 31 image finding scope remains historical.
70. **Public-release debt:** current braces HIGH, license/channel, hosted CI/GHCR,
    cloud/live/manual QA, unfixed OS-risk decision and longer heap profiling.
71. **Files:** 26 Stage 32 files listed below; user next-env is excluded.
72. **DB:** no SQL/schema/migration file changed or added.
73. **Dependencies:** no runtime/dev dependency added; lockfile unchanged; only
    root scripts change. Temporary preview utilities are not repository dependencies.
74. **User file:** `apps/web/next-env.d.ts` remains a separate unstaged change;
    expected/actual SHA-256 `0f70629890b72a0a82e91972cc032c04b658b26c265373cb711cf576bfbf8fcc`.
75. **Commit:** `docs: package TripForge portfolio engineering story`; exact hash
    supplied at handoff; no push,
    tag, release publication, profile edit or history rewrite.

## Final documentation QA

PASS: eight changed/new Markdown documents rendered using Marked 18.0.14 GFM
and Mermaid 12.1.0 in Chromium. All six diagrams parsed/rendered; table row widths
matched headers; all nine image references loaded with alt text. Diagrams and
the seven final app screenshots were visually inspected. Preview utility and
render outputs stay temporary/ignored; no rendering package is installed into
the repository or fetched by the mandatory offline docs gate. This is a local
GFM-compatible preview, not a claim of actual hosted GitHub rendering.

Final `pnpm docs:check` passed 53 Markdown files / three tests; workflow policy
passed five workflows / eight tests; `git diff --check` passed. Local links and
images resolve; anchor/external URL availability is not crawled by the offline checker.

Curated PNG sizes: dashboard 97,469 B; itinerary 165,997 B; expenses 156,369 B;
reservations 145,556 B; search 119,475 B; assistant 132,509 B; mobile 52,396 B.
PNG inspection found only IHDR/IDAT/IEND chunks, no extra embedded metadata.

## Changed files

`apps/web/next-env.d.ts` is not part of the Stage 32 change set.

```text
.dockerignore
.github/workflows/ci.yml
README.md
docs/accessibility.md
docs/assets/portfolio/assistant.png
docs/assets/portfolio/dashboard.png
docs/assets/portfolio/expenses.png
docs/assets/portfolio/itinerary-mobile.png
docs/assets/portfolio/itinerary.png
docs/assets/portfolio/reservations.png
docs/assets/portfolio/search.png
docs/local-development.md
docs/portfolio-case-study.md
docs/portfolio-evidence.md
docs/portfolio-interview-guide.md
docs/portfolio-publication-checklist.md
docs/stage32-verification.md
package.json
scripts/ci/workflow-policy.mjs
scripts/ci/workflow-policy.test.mjs
scripts/docs/check.mjs
scripts/docs/check.test.mjs
scripts/portfolio/screenshots.mjs
scripts/readiness/gates.mjs
scripts/readiness/stack.mjs
scripts/readiness/test-api.mjs
```

Changes outside docs/assets are documentation validation/capture support only.
The test launcher now accepts the tracked generated-file hash in a clean checkout
while retaining before/after preservation checks, and refuses an occupied web
port as well as API ports. A root negative check against the owned active clean
stack refused port 3310 before starting services. No product API/domain/UI,
Dockerfile or infrastructure behavior changed.
