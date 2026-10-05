# Stage 33 — v1.0.0 source-release verification

This record separates local release-candidate evidence from remote publication.
A local tag is not a release, mutable image tags are not artifact identity, and
a source release is not evidence of production traffic.

## Release identity

| Field | Value |
| --- | --- |
| Canonical source | root `package.json` |
| Application/source version | `1.0.0` |
| Intended annotated tag | `v1.0.0` |
| Intended title | `TripForge v1.0.0` |
| npm publication | Not applicable; all workspaces are private |
| Workspace policy | root is canonical; six private implementation workspaces remain `0.0.0` |

The externally meaningful v1 contract is the documented application capability,
REST behavior, data semantics and deployment artifact identity. It is not a
promise of stable independently published TypeScript package APIs.

## Source commit

Stage 33 began at security-closure commit
`d1872352c91c261eec82579def07a90908ad7884`. Mandatory hosted `main`
qualification ultimately passed at
`baf80b7a32d2cfc001faffab0a0b8cff5184100b`. The final delivery-boundary
correction is the commit containing this document; its immutable SHA is recorded
by the final report and must later pass hosted `main` before becoming a tag target.
This avoids an impossible self-referential commit hash inside its own contents.

Release freeze permits only release-blocker, release-note, security-blocker or
broken-release-automation fixes. No product feature, domain behavior, dependency
modernization or unrelated refactor is in scope.

## Local gates

Stage 33 results below were recorded from the complete deterministic suite on
2026-10-05.
Stage 31's accepted 30-minute soak/stress evidence is retained because Stage 33
does not change product, database, network or pool behavior; its only runtime
package change is the targeted Debian security revision documented below.

| Gate | Result |
| --- | --- |
| Frozen install; docs; release policy | **PASS** |
| Database generate/check/migrate twice | **PASS**; head `0014_foamy_jackal.sql`, no drift |
| Lint, typecheck, unit, coverage, accessibility | **PASS**; 591 unit tests |
| Chromium E2E | **PASS**; 12/12, one worker, retries zero |
| Security audit/current-tree/history scans/tests | **PASS**; exact exception only; current tree and all reachable text blobs scanned |
| Performance, observability, deterministic AI | **PASS**; performance 4/4, observability 25 tests, AI 30 tests + 11 evals |
| 13 readiness/recovery drills | **PASS**; 13/13 |
| Build, check, integration, check:full, peers | **PASS**; integration 98/98 and isolated `check:full` |
| Docker Compose/build/smoke and Trivy | **PASS locally**; patched runtime images, functional smoke with documented LocalStack test image |
| Terraform fmt/init/validate/test and Trivy IaC | **PASS**; tests 1/1 + 2/2, zero HIGH/CRITICAL misconfigurations |
| Workflow/release policy tests | **PASS**; workflow 11/11, release 4/4 |
| Clean release tree install/build/release/docs | **PASS**; frozen install and production build in isolated source copy |

## Hosted gates

Git access was restored after the initial publication attempt. Hosted defects
were closed in sequence: clean-runner workspace behavior, Chromium keyboard DnD,
then fixable Debian container vulnerabilities. The complete mandatory `main`
qualification at `baf80b7...` passed Quality, Integration, Database, Browser/load,
Docker, Security, Infrastructure and aggregate Gate.

The following GHCR attempt stopped before image build because both public API
and S3 origins were configured as build preconditions. The API origin is a real
browser build input and remains required. The S3 hostname depends on Terraform
`bucket_prefix`, so this delivery correction moves only that value to the web
ECS runtime. GHCR retry, repository rules, Immutable Releases, private
vulnerability reporting and trusted-tag publication remain unverified. No tag
or GitHub Release is inferred from the passing main Gate.

## Security status

The production dependency policy has one exact HIGH exception:
`GHSA-vfj7-8cjw-p6xm` / `CVE-2026-93687`, `braces@3.0.3`, through the private
ESLint chain only. It is non-production-reachable, time-bounded through
2026-11-01 and tested to fail after that date. Any changed/obsolete path,
new HIGH/CRITICAL, or production reachability fails closed.

Current-tree and reachable Git-history scans report only credential class,
path/line and blob ID on failure, never the candidate secret. Seven unchanged
portfolio screenshots were visually reviewed: all use fictional Trip/person/
reservation data and show no email, key, AWS account, session or local path.
Documentation checks reject absolute developer paths.

The owner selected MIT. The canonical root `LICENSE` records
`Copyright (c) 2026 Artur Pravdivtsev`; no dual license or additional holder is
invented. No `SECURITY.md` is fabricated because a real remote private-
reporting capability cannot be inspected; enable GitHub private vulnerability
reporting/Security Advisories before public publication.

## Container artifacts

The exact allowed `node:24.21.0-bookworm-slim` multi-platform digest was checked
on 2026-10-04 and still resolves to
`sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6`.
There is no newer digest on that pinned tag, so no cosmetic base churn is made.
A fresh Trivy 0.74.0 database initially exposed fixable Debian findings in
`libpcre2-8-0` and later `perl-base`. Both runtime Dockerfiles install the exact
Bookworm security revisions `10.42-1+deb12u2` and `5.36.0-7+deb12u4`; current
rescans report the same result for all three images: **48 HIGH, 1 CRITICAL,
0 fixable HIGH and 0 fixable CRITICAL**. These are unfixed Debian findings, not a clean-image or
non-exploitability claim. `braces` is absent from web, API/worker, migrate and
browser runtime artifacts.

| Local image | Image ID | Size (bytes) |
| --- | --- | ---: |
| `tripforge-ci-web:local` | `sha256:c47045dda2bdec965e69529e20daaa6b7af9349aafe9c62e29098422d0dfd7e5` | 329846008 |
| `tripforge-ci-api:local` | `sha256:2bf2a8c51e0f9f59dcb45afd673dfdcea3813630bfef10209b5081707b4d5501` | 393066028 |
| `tripforge-ci-migrate:local` | `sha256:2e43bdb9cccd021decff0b2ec798953903e443b9c1b630692e4291a0994f9e31` | 393736108 |

All three expose `TRIPFORGE_VERSION=1.0.0`; the worker uses the API image. The
local Compose API/worker use `NODE_ENV=development` with their intentionally
plaintext local Redis, while production validation continues to require
`rediss://`. Compose migration ran repeatedly, web/API/worker health passed, and
the calendar-versioned LocalStack service correctly remained unavailable without
its external account token. The functional smoke used the separately documented
`localstack/localstack:4.14.0` test image; `2026.08.3` remains pending external
token qualification.

The migration head remains `0014_foamy_jackal.sql`; Stage 33 adds no migration.
The API image remains the worker image when started with `node dist/worker.js`.

## SBOM and provenance

Trusted tag publication requests BuildKit `sbom: true` and
`provenance: mode=max` for all three images. Optional GitHub attestations remain
capability-gated. These settings are locally policy-tested, but actual registry
attestations cannot be verified until hosted tag publication.

## GitHub Release

The trusted tag workflow is designed as:

```text
CI / Gate → GHCR publish → manifest + SHA256SUMS → complete draft → verify → publish
```

Only the tag-only release job gets `contents: write`; it uses the built-in token,
refuses an existing release, validates exact assets/schema/checksum and never
moves a tag or overwrites an asset. Immutable Releases, branch protection, GHCR
visibility and private reporting remain owner/admin settings pending verification.
No final tag, draft or release currently exists; GHCR publication retry remains pending.

## Known limitations

- Real AWS deployment, PITR, ElastiCache failover, ECS rollback and effective
  IAM/TLS/WSS qualification remain pending; no AWS resources were created.
- Live OpenAI, ORS and MapTiler qualification remains pending where applicable.
- Manual VoiceOver/Safari, 200%/400% zoom and text-spacing QA remains pending.
- Stage 31 client/harness heap median moved 12.422 → 13.765 MiB (+1.344); this
  remains a longer-run profiling item, not a confirmed memory leak.
- The development-tool exception must be re-reviewed before publication after
  2026-11-01; unfixed base-image OS findings remain monitored.
- Portfolio editorial review is pending and does not rewrite the accepted case
  study/CV summary during release engineering.

## External deployment status

AWS infrastructure is implemented and statically validated, but not verified in
AWS. This source-release stage performs no `terraform apply`, deploy workflow,
visibility change or paid cloud action. A future deployment must consume the
three `@sha256` references from the release manifest and migrate before rollout.

## Go/no-go decision

- Local release candidate: **GO — LOCALLY QUALIFIED**.
- Remote release: **NOT PUBLISHED** — mandatory main Gate passed, but final GHCR/
  trusted-tag publication has not run successfully.
- Public repository publication: **PENDING EXTERNAL** — MIT is resolved; visibility,
  repository rules, Immutable Releases and private reporting remain to verify.
