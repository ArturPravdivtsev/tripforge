# Release qualification checklist

Status vocabulary: **PASS**, **PENDING EXTERNAL**, **NOT APPLICABLE**, or
**BLOCKED**. A local PASS never satisfies its hosted/AWS counterpart.

## Source and CI

- **PASS** — frozen install, DB generation/check, lint/typecheck, unit/coverage/
  accessibility, integration/check/check:full, audit/current/history secret scans,
  security, bundle/performance, observability, deterministic AI, peer/workflow,
  release-policy and whitespace checks pass.
- **PENDING EXTERNAL** — hosted `CI / Gate`, Browser E2E + k6 smoke, branch rules,
  CodeQL and Dependency Review cannot be inspected without a remote/valid token.
- **PASS** — policy tests require full-SHA actions and deny PR credentials,
  publishing permissions and privileged artifact bridges.
- **PASS** — web/API/migrate images are rebuilt and scanned; all expose `1.0.0`,
  worker uses the API image, and runtime artifacts exclude browser/load tooling
  and `braces`. Published registry digests/revisions remain pending hosted CI.
- **PASS** — separate `apps/web/next-env.d.ts` remains unstaged at SHA-256
  `0f70629890b72a0a82e91972cc032c04b658b26c265373cb711cf576bfbf8fcc`.

## Browser and accessibility

- **PASS** — production-built Chromium qualification is 12/12 with retries zero:
  auth/Back, lifecycle, RBAC/revoke, itinerary pointer/keyboard/Move, transport,
  expenses, upload/download bytes, notification/realtime/search and AI privacy UX.
- **PASS** — automated axe, CSP, keyboard/combobox/mobile/composer and
  320/375/768px reflow coverage passes.
- **PENDING EXTERNAL** — human VoiceOver/Safari, native 200%/400% zoom, text
  spacing, forced colors and manual resource inspection need a named operator.
- **PENDING EXTERNAL** — restricted live MapTiler/ORS/OpenAI smoke requires
  approved disposable data and credentials.

## Security, migration and data recovery

- **PASS** — dependency policy permits only the exact unexpired, dev-only
  `braces@3.0.3` HIGH exception through 2026-11-01.
- **PASS** — fresh image scans: each image has 52 HIGH/4 CRITICAL unfixed Debian
  findings and zero fixable HIGH/CRITICAL after the `libpcre2-8-0` patch.
  Production risk acceptance remains an operator decision.
- **PASS** (local) — dedicated DML role and migrator separation are exercised;
  **PENDING EXTERNAL** for hosted secret rotation/restart.
- **PENDING EXTERNAL** — actual TLS RDS `SHOW max_connections` and rolling pool
  budget require the target environment.
- **PASS** — migration safety and repeated migration pass; Stage 33 adds no SQL.
- **PENDING EXTERNAL** — RDS snapshot/retention/LatestRestorableTime and PITR into
  a new DB require approved disposable AWS resources.
- **PASS** (local) — S3 version/delete-marker recovery and authorization pass;
  **PENDING EXTERNAL** for AWS S3 durability qualification.

## Performance and resilience

- **PASS** — accepted Stage 31 smoke/load/stress/30-minute soak evidence remains
  applicable; Stage 33 changes no DB/network/pool/product runtime behavior.
- **PASS** — PostgreSQL, Redis/FLUSHDB, worker backlog, S3, Collector and ORS/AI
  controlled drills pass on owned disposable resources.
- **PASS** — HTTP/worker drain, two-node sockets/rejoin/refetch and pool recovery
  pass locally; cloud ALB/ECS behavior remains **PENDING EXTERNAL**.
- **PENDING EXTERNAL** — production autoscaling, cooldowns and hosted-capacity
  review require a target environment.

## Deploy, observe, smoke, rollback

- **PENDING EXTERNAL** — account/region, protected Environment, TLS/domain,
  ingress, Redis TLS/AUTH, S3 IAM/CORS and public origins.
- **PASS** (local) — migration exits zero before service startup and is
  idempotent; hosted task failure evidence remains **PENDING EXTERNAL**.
- **PENDING EXTERNAL** — ALB/ECS steady state, secure cookie/WSS and cross-node
  behavior after deployment.
- **PENDING EXTERNAL** — explicit-origin operational smoke against a deployed URL.
- **PENDING EXTERNAL** — hosted logs/traces/metrics, alert routing, on-call access
  and current error budget.
- **PENDING EXTERNAL** — previous published digests and deployed rollback drill.
- **PASS** — nine runbooks are present; assignment of live SEV owner/channel is
  **PENDING EXTERNAL**.

## Publication

- **BLOCKED** — no Git remote and the available GitHub CLI credential is invalid;
  hosted main/tag CI, immutable GHCR digests and GitHub Release cannot be produced.
- **BLOCKED** — public visibility requires an owner license decision; no license
  is fabricated.
- **PENDING EXTERNAL** — enable GitHub private vulnerability reporting and verify
  repository rules, immutable releases and package visibility before publication.
- **NOT APPLICABLE** — npm publication; every workspace package is private.
