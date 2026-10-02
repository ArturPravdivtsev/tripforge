# CI/CD and supply-chain delivery

Stage 28 automates verification and produces deployable OCI artifacts. Stage 29
adds a separate, deliberate AWS promotion workflow. CI answers whether a commit
is safe to merge; trusted delivery publishes images; production deployment
consumes exact verified digests without rebuilding.

## Pipeline

```text
pull_request (untrusted source)
  ├─ Quality
  ├─ Database
  ├─ Integration
  ├─ Security
  ├─ Docker build + Trivy + smoke
  └─ Terraform fmt + validate + tests + Trivy IaC
           │
           ▼
        CI / Gate
```

The six jobs run in parallel on `ubuntu-latest`; each has a finite timeout.
`CI / Gate` always runs and succeeds only when all six results are `success`.
The stable required-check name is `CI / Gate` (workflow `CI`, job `Gate`).
CodeQL and Dependency Review are separate, plan-dependent checks and do not
weaken or replace the mandatory local security gates.

```text
trusted main or valid vX.Y.Z push
  → same CI / Gate
  → GHCR login with ephemeral GITHUB_TOKEN
  → BuildKit web + api + migrate
  → SHA tags + image digests
  → BuildKit SBOM + max provenance
  → delivery-manifest.json
```

There is no `pull_request_target`, `workflow_run` privilege bridge, PR registry
login, PR secret use, or execution of a PR-produced artifact in a privileged
job. A same-repository PR is treated as untrusted in exactly the same way as a
fork PR.

## Runtime and immutable dependencies

- Runner: `ubuntu-latest`.
- Node: `24.21.0`; pnpm: `12.3.4`.
- Checkout `v7.0.1`, setup-node `v7.0.0`, and pnpm setup `v6.0.10` are pinned
  to verified full 40-character upstream commit SHAs.
- Docker Buildx `v4.4.1`, build-push `v7.4.0`, login `v4.6.0`, metadata
  `v6.2.0`, upload-artifact `v7.0.1`, CodeQL `v4.38.2`, Dependency Review
  `v5.0.0`, setup-trivy `v0.3.1`, and attest `v4.2.2` are pinned the same way.
- Production Dockerfiles use the readable `node:24.21.0-bookworm-slim` tag plus
  an immutable multi-platform digest. PostgreSQL 18.6 is also digest-pinned.
- Weekly Dependabot entries cover GitHub Actions, the pnpm/npm workspace, root
  Compose Docker references, and Dockerfiles. Updates are reviewed; there is no
  auto-merge.

The workflow checker parses YAML and rejects mutable external action refs,
`pull_request_target`, `workflow_run`, root write permissions, unexpected
job-level writes, forced cache writes, an unguarded publisher, or a gate missing
mandatory dependencies. Unit fixtures exercise both accepting and rejecting
paths.

## Permissions, caches, and concurrency

All workflows default to `contents: read`. Validation jobs receive no write
scope. Only trusted `publish` receives `packages: write`, `id-token: write`, and
`attestations: write`; CodeQL alone receives `security-events: write` when that
feature is enabled. Checkout does not persist credentials.

`setup-node` keys pnpm's dependency cache from `pnpm-lock.yaml`. No workflow
forces cache writes, and caches contain no environment files or credentials.
GitHub therefore preserves its read-only cache boundary for fork PRs. Trivy's
binary cache is deliberately disabled; it does not create an extra third-party
cache trust path.

Concurrency cancels superseded branch/PR runs. Tag runs are not cancelled, so
one release cannot interrupt another. Jobs stop on the first failing command;
there is no whole-suite retry that could hide flakes.

## Mandatory jobs

`Quality` performs a frozen install, Drizzle generation plus generated-file
diff, `db:check`, lint, typecheck, unit/component tests, coverage, accessibility,
production Webpack build, all ten bundle budgets, deterministic observability
configuration/tests, peer validation, workflow tests/policy, whitespace checks,
and a clean-worktree assertion.

`Database` starts an empty digest-pinned PostgreSQL 18.6 service, applies all
committed migrations twice, then verifies that every SQL hash occurs exactly
once and that `pg_trgm` exists. It has no route to a developer, staging, or
production database.

`Integration` runs the existing Testcontainers suite, including real
PostgreSQL, Redis/BullMQ, two-node Socket.IO, and the credential-free Community
S3 test path. `Security` runs the production audit, repository secret scan, and
the security regression suite. The overlap with integration is intentional:
the security job owns the security-specific real-service cases.

`Docker` validates both base and observability Compose models and builds the
exact production Dockerfiles for web, API/worker, and migrate without pushing.
It runs Trivy `0.74.0` and container smoke tests: migration against disposable
PostgreSQL, API `/health`, and web HTTP with `OTEL_ENABLED=false`. Redis is used
for API realtime startup; LocalStack is not required for this basic smoke path.

Trivy first reports all HIGH/CRITICAL findings, including unfixed ones. The
blocking pass uses `--ignore-unfixed` so a merge is blocked by HIGH/CRITICAL
findings for which an image/package fix exists. Unfixed findings cannot be
remediated by changing the image and remain visible for review. Unused bundled
`npm`/`npx` tooling is removed from production images to reduce attack surface.
There is no blanket ignore file; any future exception must name CVE,
image/package, reason, mitigation, and review date.

## Image contract

| Image | Responsibility |
| --- | --- |
| `ghcr.io/<lowercase-owner>/tripforge-web` | Next standalone browser/server runtime |
| `ghcr.io/<lowercase-owner>/tripforge-api` | API; also worker with command `node dist/worker.js` |
| `ghcr.io/<lowercase-owner>/tripforge-migrate` | Apply the committed Drizzle chain before application tasks |

Every image gets `sha-<full-commit>` plus OCI source, revision, creation time,
and title metadata. `main` is a convenience tag only on main pushes. A valid
`v1.2.3` tag adds `1.2.3`, `1.2`, `1`, and `latest`; Stage 28 creates no release
or tag. Production must select `name@sha256:<digest>`, never rely only on a
mutable tag. Previous application digests enable application rollback, but an
image rollback does not reverse a database migration.

BuildKit `sbom: true` records image contents and `provenance: mode=max` records
how the image was built. Neither proves safety; Trivy detects known
vulnerabilities at scan time, and all three controls have different purposes.
Optional GitHub/Sigstore registry attestations run only when repository variable
`ENABLE_GITHUB_ATTESTATIONS=true`; unsupported private-repository plans do not
disable mandatory BuildKit SBOM/provenance.

The 14-day `delivery-manifest-<commit>` artifact contains only commit SHA and
web/API/migrate names and digests. The job summary also records those digests and
pulled-platform sizes. Stage 29 should deploy exactly these digests, use the API
digest for the worker command, and run the migrate digest in the appropriate
ordering rather than rebuilding source.

The migration target reuses the scanned API production runtime, adds only the
committed SQL journal, and starts the compiled `drizzle-orm` migrator. It does
not ship Drizzle Kit or the workspace development dependency set. The verified
local platform sizes were approximately 320 MB web, 355 MB API, and 356 MB
migrate; registry compression and target architecture will change those values.

## Build-time and runtime configuration

The web artifact is not environment-neutral. These browser-visible values are
baked into its JavaScript by the trusted build:

- required `TRIPFORGE_PUBLIC_API_URL` → `NEXT_PUBLIC_API_URL`;
- optional `TRIPFORGE_PUBLIC_MAPTILER_KEY` → `NEXT_PUBLIC_MAPTILER_KEY`;
- required `TRIPFORGE_PUBLIC_S3_UPLOAD_ORIGIN` →
  `NEXT_PUBLIC_S3_UPLOAD_ORIGIN`.

They are GitHub repository variables, not secrets. A MapTiler browser key may be
public client configuration, but it must be domain/referer restricted where the
provider supports that. A different public configuration requires a newly built
digest; never reuse the same version for different bytes.

Database/Redis URLs, AWS credentials, S3 server endpoints, session material,
OpenRouteService credentials, and all future cloud credentials are runtime
server configuration. They are never Docker build arguments, labels, cache
content or provenance inputs. Account, role, cluster, database endpoint, and
production-domain values remain operator-owned variables rather than source
defaults.

## AWS promotion

`.github/workflows/deploy-aws.yml` is `workflow_dispatch`-only and uses the
protected GitHub `production` Environment. It receives one source commit and
three `sha256:<64 hex>` digests, verifies trusted-main ancestry and OCI revision
metadata, then assumes the Terraform-provisioned deploy role through GitHub
OIDC. Only this job gets `id-token: write`; normal PR CI has no AWS credentials
or deploy permission.

```text
validate digests/revision
→ register + run migration task
→ require exit 0
→ register API/worker/web revisions
→ update services
→ wait for ECS steady state
→ HTTPS health smoke
```

A failed migration stops before service updates. GitHub concurrency permits one
production writer. Circuit breakers can roll back unhealthy ECS revisions. A
previous application rollback re-promotes previous digests; it never reverses
schema changes. Full inputs are in [AWS deployment](./aws-deployment.md).

Workflow policy permits `aws-actions/configure-aws-credentials` only in this
file, requires a full SHA, OIDC, the production Environment, migration-before-
rollout markers, no public migration IP, and the steady-state waiter. Static AWS
credential names and AWS credential actions in PR-capable workflows fail CI.

## GHCR and artifact inspection

In the repository, open **Packages**, choose an image, locate the immutable
`sha-...` version, and copy its digest. With package read permission:

```bash
docker pull ghcr.io/<owner>/tripforge-api@sha256:<digest>
docker buildx imagetools inspect ghcr.io/<owner>/tripforge-api@sha256:<digest>
```

Use the run's delivery-manifest artifact as the complete three-image handoff.
A partially published run is failed and is not a complete release set, even if
one immutable digest already exists.

## Local parity

```bash
pnpm install --frozen-lockfile
pnpm ci:workflow:test
pnpm ci:workflow:check
pnpm ci:quality       # deterministic Quality job commands
pnpm ci:security      # mandatory Security job commands
pnpm ci:integration   # Docker/Testcontainers Integration job
pnpm ci:verify        # generation drift + quality + security
docker compose -f compose.yaml config --quiet
docker compose -f compose.yaml -f compose.observability.yaml config --quiet
```

Docker image build, Trivy, and container smoke remain explicit workflow steps so
their trust policy is reviewable in YAML. No GitHub Actions emulator is needed.

## One-time GitHub administrator configuration

YAML cannot configure repository protection. An administrator must:

1. Enable GitHub Actions and permit GitHub-owned, Docker-owned, and explicitly
   reviewed third-party actions; retain the repository's full-SHA policy.
2. Create a main ruleset: require a pull request, require `CI / Gate`, require
   conversation resolution, block force pushes, and block deletion.
3. Decide whether to require the branch to be up to date. Strict mode reduces
   stale-base risk but causes an additional CI run after main advances.
4. Enable dependency graph/Dependabot and configure GHCR package visibility.
5. Set the three `TRIPFORGE_PUBLIC_*` repository variables before a trusted
   publish. No PAT or admin token is needed; publication uses `GITHUB_TOKEN`.
6. If the plan supports GitHub Code Security, set
   `ENABLE_GITHUB_CODE_SECURITY=true`, enable code scanning/dependency review,
   and optionally require their stable checks.
7. If artifact attestations are supported, set
   `ENABLE_GITHUB_ATTESTATIONS=true`; otherwise leave it unset.

Actual pull-request, trusted-push, GHCR, SBOM, provenance, and branch-protection
QA requires a configured GitHub remote and authenticated repository access. It
must be recorded after the first real run; local YAML validation is not evidence
that those hosted features executed.

## Supply-chain boundary

```text
reviewed source commit
  → immutable GitHub Action SHAs
  → isolated GitHub runner + BuildKit
  → scanned GHCR OCI digest
  → Stage 29 ECS deployment by digest
```

Mutable third-party actions can compromise a build, poisoned untrusted caches
can cross privilege boundaries, registry credentials can leak through build
args, and untrusted artifacts can become code execution in a privileged job.
The pinning, cache policy, same-workflow trusted publisher, no artifact bridge,
and digest handoff directly address those threats.

## AI gates

Normal CI runs deterministic `pnpm ai:test` and `pnpm ai:eval` without an
OpenAI credential. Database migration generation/checks, security/secret scans,
frontend SSE tests, build, bundle budget, observability, Docker, Terraform, and
IaC Trivy remain ordinary required gates. No OpenAI secret is available to pull
request jobs or image builds.

`pnpm ai:eval:live` is an explicit manual command for a trusted environment with
an intentionally supplied provider key. Probabilistic paid output is diagnostic,
not a merge gate, and is never passed between workflows as an artifact.
