# Stage 33 — v1.0.0 source-release verification

**V1.0.0 RELEASE CANDIDATE — HOSTED MAIN QUALIFIED, READY FOR TAG CEREMONY**

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
`baf80b7a32d2cfc001faffab0a0b8cff5184100b`. Delivery-boundary and hosted
clean-runner blockers were then closed, followed by the targeted npm security
patches in `6603ada5789a0a533de2f2565f9234e51771b9ba`. That current candidate
passed the mandatory hosted `main` Gate and GHCR publication; immutable SHA
images exist for web, API and migrate. It is the qualified source commit for the
future tag ceremony, but no tag or GitHub Release exists yet.

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

Git access and GitHub CLI authentication were restored after the initial blocked
publication attempt. Hosted defects were closed in sequence: clean-runner
workspace behavior, Chromium keyboard DnD, fixable Debian container
vulnerabilities, GHCR delivery configuration, and the subsequently reviewed npm
advisories. The complete mandatory `main` qualification for
`6603ada5789a0a533de2f2565f9234e51771b9ba` passed Quality, Integration,
Database, Browser/load, Docker, Security, Infrastructure and aggregate Gate.

GHCR publication also passed for that commit, and immutable SHA images exist for
web, API and migrate. The repository is public; the active ruleset is
`Protect main`; Immutable Releases and private vulnerability reporting are
enabled. These resolved items preserve the chronology of earlier blockers but
do not imply trusted-tag CI, a `v1.0.0` tag or a GitHub Release.

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
invented. GitHub private vulnerability reporting is enabled, so the repository
has a real private reporting channel without a fabricated security email.

## Container artifacts

The exact allowed `node:24.21.0-bookworm-slim` multi-platform digest was checked
on 2026-10-04 and still resolves to
`sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6`.
There is no newer digest on that pinned tag, so no cosmetic base churn is made.
A fresh Trivy 0.74.0 database initially exposed fixable Debian findings in
`libpcre2-8-0` and later `perl-base`. Both runtime Dockerfiles install the exact
Bookworm security revisions `10.42-1+deb12u2` and `5.36.0-7+deb12u4`; current
rescans report the same result for all three images: **49 unfixed HIGH/CRITICAL
OS findings, 0 fixable HIGH/CRITICAL and 0 Node package findings**. These are
unfixed Debian findings, not a clean-image or non-exploitability claim. `braces`
is absent from web, API/worker, migrate and browser runtime artifacts.

| Local image | Image ID |
| --- | --- |
| `tripforge-ci-web:local` | `sha256:26ed88904ed1c7e5e52eca9396c84d57b05536ae62cbd19511885b6c0556631d` |
| `tripforge-ci-api:local` | `sha256:44dec55a75b484411a0914a9ae7e79b3c7f93c7418ac0b828aadf43d70d7cc81` |
| `tripforge-ci-migrate:local` | `sha256:2636d55a85250b9f49d4a3e6d1c569eba0a9c252219db6702fbc57f81b3d5cc8` |

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
moves a tag or overwrites an asset. Immutable Releases is enabled, `Protect main`
is active, and private vulnerability reporting is enabled. Candidate GHCR
publication passed; no final tag, draft or release currently exists, and tag CI
has not run.

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

- Release candidate: **GO — LOCALLY AND HOSTED-MAIN QUALIFIED**.
- Candidate artifacts: **PASS** — immutable GHCR SHA images exist for web, API
  and migrate at `6603ada5789a0a533de2f2565f9234e51771b9ba`.
- Remote release: **NOT PUBLISHED** — trusted-tag CI has not run; `v1.0.0` and its
  GitHub Release do not exist.
- Repository publication controls: **PASS** — public visibility, MIT, active
  `Protect main`, Immutable Releases and private vulnerability reporting verified.
- Final status: **V1.0.0 RELEASE CANDIDATE — HOSTED MAIN QUALIFIED, READY FOR TAG CEREMONY**.
