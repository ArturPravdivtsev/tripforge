# Portfolio publication checklist

Stage 32 packages an unreleased release candidate. Stage 33 will decide publication
and v1.0; it must not manufacture a live deployment to make the portfolio look complete.

- [ ] Choose a repository license before public v1.0 publication. No LICENSE was
      found during Stage 32 inspection; no license is selected on the owner's behalf.
- [ ] Confirm intended public remote/visibility and hosted CI/GHCR/protection.
      No guessed CI/license/release badges or nonexistent live-demo links.
- [ ] Establish a real private vulnerability reporting channel. SECURITY.md is
      deferred until that channel and supported release policy exist; do not
      invent an email or send security reports to public issue comments.
- [ ] Review curated screenshots for fictional data, readable UI and metadata.
      AI image uses a deterministic provider-only fixture, not live generation.
- [ ] Run docs/secret checks and review committed files/history for private data.
      If a historical secret is discovered, stop publication and arrange rotation
      and reviewed remediation; never casually rewrite history in this stage.
- [ ] Decide AWS deployment/live-demo scope and costs. Real TLS/WSS/IAM/S3 smoke,
      RDS PITR, ElastiCache failover, ECS rollback, RPO/RTO and connection headroom
      remain pending external qualification. See [AWS](./aws-deployment.md).
- [ ] Intentionally provide restricted live OpenAI/ORS/MapTiler credentials for
      their own small qualification, not load tests or untrusted PR jobs.
- [ ] Record VoiceOver/Safari, actual 200%/400% zoom, text spacing and forced colors
      where applicable; browser axe/viewport results do not replace manual AT.
- [ ] Review unfixed base-OS HIGH/CRITICAL findings with vendor/reachability/
      mitigation evidence; release owner approves a named exception or blocks
      production. No clean-image or known-exploitable-app conclusion is implied.
- [ ] Re-review the exact ESLint-only `braces` HIGH exception
      (GHSA-vfj7-8cjw-p6xm) by 2026-11-01; remove it when fixed or block if runtime
      reachability/path changes. The policy is not a wildcard suppression.
- [ ] Profile the small socket-client/harness heap drift over a longer interval
      and inspect retention paths before claiming no leaks. Browser upload/cancel
      resources, RUM and end-to-end network/burn SLIs remain separate debt.
- [ ] Preserve the owner's separate `apps/web/next-env.d.ts`; no migration or
      application dependency is justified by portfolio content.

Use the broader [release checklist](./release-checklist.md) and
[Stage 31 evidence](./stage31-qualification.md) for operational sign-off.
No Git history rewrite, GitHub profile change, tag, push or release publication
is part of Stage 32.
