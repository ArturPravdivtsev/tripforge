# Local development

The root README is the short portfolio entry point. This document preserves the
operational details; [Docker](./docker.md), [database](./database.md) and
[testing strategy](./testing-strategy.md) contain subsystem-specific instructions.

## Reproducible disposable quick start

Requirements: Node.js 24, pnpm 12.3.4, Docker and free loopback ports 3310,
4410–4413, 15431, 16381, 14561. No AWS or paid-provider key is required.

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm readiness:serve
```

Open <http://127.0.0.1:3310> and register a fictional account. API `/health` and
`/ready` are under <http://127.0.0.1:4410>. The launcher installs the frozen
workspaces into a temporary source copy, builds web/API/worker/migrator, applies
migrations twice and provisions a DML role. Services are new Testcontainers:
PostgreSQL 18.6, Redis 8.10.1 and local S3 emulator 4.14.0. This older test emulator
is separate from the account-token requirement of the normal Compose image.

This is a production-built **test** stack. Only external-provider boundaries are
deterministic; persistence, authorization, sessions and S3 remain real. It is not
a deployed service or a live OpenAI/ORS/MapTiler check. Ctrl+C closes owned
processes/pools/containers. Data is disposable, not a persistent personal planner.
Do not attach a second launcher or capture process to occupied fixture ports.
Temporary source copies remain available for operator inspection; do not use
broad recursive cleanup commands. Credentials in ignored `readiness-results/`
are test-only but must still not be published.

## Faster native workflow

Use [API environment example](../apps/api/.env.example) and
[web environment example](../apps/web/.env.example). Defaults are web 3000,
API 4000, PG 5433. Both cookie origins must use the same hostname style.

```bash
docker compose up -d db
pnpm db:migrate
pnpm dev
```

Protected limiter actions and realtime need a reachable Redis. The base Compose
Redis is internal-only; configure a deliberate local Redis endpoint for native
processes instead of assuming a published 6379 port. Optional provider-dependent
features may show unavailable states; do not relax security to hide missing Redis.
For the full production-like Compose stack, set an uncommitted
`LOCALSTACK_AUTH_TOKEN` for the pinned 2026.08.3 emulator, then follow
[Docker runtime](./docker.md). Never commit provider credentials or run these
commands against production. The worker is a separate process, not a web route.

## Commands and boundaries

| Task | Command |
| --- | --- |
| Build / lint / types | `pnpm build`, `pnpm lint`, `pnpm typecheck` |
| Unit / integration / browser | `pnpm test`, `pnpm test:integration`, `pnpm test:e2e` |
| Accessibility / docs | `pnpm test:a11y`, `pnpm docs:check` |
| Security | `pnpm security:audit`, `pnpm security:secrets`, `pnpm test:security` |
| Bundles / DB profiles | `pnpm perf:bundle`, `pnpm perf:db` |
| Observability | `pnpm observability:config:check`, `pnpm observability:test` |
| Deterministic AI | `pnpm ai:test`, `pnpm ai:eval` |
| Safe local failures | `pnpm readiness:test` |
| Opt-in k6 | `K6_BINARY=/absolute/path/to/k6 pnpm perf:load smoke load` |
| Curated screenshots | `PORTFOLIO_BASE_URL=http://127.0.0.1:3310 pnpm portfolio:screenshots` |

Live AI smoke is explicit/paid, never normal PR CI. Terraform 1.16.4 is needed only
for infrastructure gates; cloud credentials and mutation approval are separate.
Next may generate `next-env.d.ts` during normal builds. Qualification uses source
copies to preserve the owner's explicitly separate local modification; do not
stage that file accidentally. See [release checklist](./release-checklist.md).
