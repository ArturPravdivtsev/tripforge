# Release qualification checklist

Record release revision, previous known-good three-image digest set, target AWS
account/region/environment, operator, evidence links, pending exceptions and
rollback owner. A checked local row does not satisfy its AWS counterpart.

## Source and CI

- [ ] Frozen install; generation/check; no unreviewed SQL drift; lint/typecheck,
      tests/coverage/a11y, integration/check/check:full, audit/secret/security,
      bundle/performance, observability, AI deterministic eval, peer/workflow and
      whitespace checks pass on the candidate revision.
- [ ] Mandatory `CI / Gate`, including Browser E2E + k6 smoke, succeeds in hosted
      CI. Configure repository protection; YAML cannot do this itself.
- [ ] All external actions full-SHA pinned; PRs receive no AWS/OpenAI credentials,
      publishing permission or privileged artifact bridge.
- [ ] Candidate web/API/migrate images built/scanned; immutable digests and OCI
      revision match; worker runs the API digest. No browser/load tooling in runtime.
- [ ] User's separate `apps/web/next-env.d.ts` is unstaged; required SHA preserved.

## Browser and accessibility

- [ ] Production-built Chromium suite, retries zero: auth/Back, Trip lifecycle,
      two-user RBAC/revoke, itinerary pointer + keyboard + Move, transport,
      equal/custom expenses and settlements, direct upload/download bytes,
      notification read/unread multi-tab, search/realtime, AI Stop/preview/Apply/
      Dismiss/viewer/privacy.
- [ ] Six-screen axe, CSP, keyboard/combobox/mobile menu/composer and 320/375/768px
      reflow pass. Failure artifacts reviewed; flakes are investigated, not retried away.
- [ ] Human VoiceOver + Safari and real 200%/400% browser zoom, text spacing,
      reduced motion/forced colors and upload/cancel resource inspection recorded,
      or named release exception remains explicit.
- [ ] Restricted MapTiler/ORS/OpenAI live smoke only with approved disposable data
      and credentials; absence of keys is pending, not a pass.

## Security, migration and data recovery

- [ ] Re-scan immutable images with fresh vulnerability data; investigate vendor
      status/runtime exposure of unfixed base-OS HIGH/CRITICAL findings. Named
      release owner approves a documented exception/mitigation or blocks production;
      zero fixable findings is not a clean-image or non-exploitability claim.
- [ ] App DB secret references dedicated DML role; API/worker never use master.
      Migrator/schema-owner secret separate; privileges and rotation/restart tested.
- [ ] Actual TLS RDS `SHOW max_connections` recorded; rolling pool budget including
      readiness/worker/migration/operations fits verified headroom.
- [ ] `pnpm migrations:safety`; destructive change requires exact SHA/reviewer/
      reason/compatibility/recovery metadata. Expand then migrate/backfill, verify,
      deploy consumers, contract only after old revisions can no longer run.
- [ ] Pre-migration RDS snapshot available when risk requires it; automated backup
      retention and LatestRestorableTime inspected. PITR restores to NEW DB, never
      overwrites source; observed RPO/RTO and cleanup recorded in disposable AWS.
- [ ] S3 versions/delete-marker recovery and application metadata/authorization
      reconciliation checked; normal product delete semantics unchanged.

## Performance and resilience

- [ ] Safe fixture, smoke + 10m load thresholds; stress and 30m soak evidence,
      RPS/p95/p99/error, CPU/RSS/heap/GC/pool/loop observations and host caveat recorded.
- [ ] PostgreSQL, Redis outage + FLUSHDB, worker backlog, S3, Collector, ORS/AI
      controlled drills pass locally. Only owned disposable resources mutated.
- [ ] Active HTTP/worker drain, two-node sockets/rejoin/refetch, no listener growth,
      pool waiters return to zero. Cloud ALB/ECS semantics qualified separately.
- [ ] Autoscaling limits/cooldowns and worker concurrency reviewed against hosted
      capacity; no unconditional production maximum inferred from laptop runs.

## Deploy, observe, smoke, rollback

- [ ] Correct account/region and protected Environment; TLS/domain/private ingress,
      Redis TLS/AUTH, S3 IAM/CORS and public web build origins match target.
- [ ] Migration task exit zero before any service update; failure evidence includes
      task exit and no rollout. App rollback never reverses schema.
- [ ] ALB API `/ready`, web `/health`; ECS steady state; secure cookie/WSS/realtime
      cross-node and optional provider independence verified after deploy.
- [ ] Read-only explicit-origin `pnpm smoke:operational` passes. Optional mutations
      require pre-provisioned disposable prefix/credentials + acknowledgement;
      created Trip removed, session logged out, cleanup errors surfaced.
- [ ] Safe structured logs/traces/metrics appear; no secrets/private content;
      alert routing and on-call access tested. Current error-budget status reviewed.
- [ ] Previous immutable digests ready; dedicated test environment circuit-breaker
      bad revision and manual rollback drill recorded. Never intentionally break
      live production to prove rollback.
- [ ] Nine runbooks accessible; SEV owner and communication channel known.
      Pending AWS/AT/live-provider/CI qualifications explicitly accepted or block release.
