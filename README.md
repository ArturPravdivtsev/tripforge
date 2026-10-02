# TripForge

TripForge is a collaborative travel planner. The current product flow supports
browser authentication, collaborative Trips, structured Days and itinerary,
MapTiler-backed optional place search, persisted ORS route snapshots, and a
combined destination/itinerary/route map. Trips also support structured booking
records with optional itinerary links and typed transport details, plus exact
multi-currency expenses, participant splits, balances, and settlement suggestions.
Private Trip documents use direct browser uploads to S3-compatible storage.
Durable background cleanup uses a PostgreSQL transactional outbox, BullMQ v6,
and an AOF-backed Redis worker process. Authenticated Socket.IO collaboration
uses the same Redis service as an isolated inter-node Streams transport while
REST remains the only mutation path.
PostgreSQL-backed, user-scoped notifications provide a durable inbox for Trip
sharing, access changes, and selected reservation, expense, and document events;
Socket.IO carries only best-effort cache invalidations.
Each Trip also has permission-safe PostgreSQL full-text and typo-tolerant search
across destinations, itinerary, reservations, expenses, and ready documents.
Production-oriented observability adds correlated Pino JSON logs plus
OpenTelemetry traces and metrics routed through a local Collector to Jaeger and
Prometheus; telemetry backends remain optional to product correctness.

## Structure

```text
apps/
  web/                  Next.js web application
  api/                  NestJS API
packages/
  contracts/            Shared transport contracts
  eslint-config/        Shared ESLint configuration
  typescript-config/    Shared TypeScript configuration
  ui/                   Reusable presentation primitives
infra/
  terraform/            AWS bootstrap and production infrastructure
```

## Prerequisites

- Node.js 24 LTS
- Corepack (included with supported Node.js installations)
- Terraform 1.16.4 for AWS infrastructure work

## Setup

```bash
corepack enable
pnpm install
```

## Commands

```bash
pnpm dev        # Start web and API in watch mode
pnpm build      # Build all workspaces
pnpm lint       # Lint all workspaces
pnpm typecheck  # Type-check all workspaces
pnpm test       # Run workspace tests
pnpm test:a11y  # Run representative accessibility component checks
pnpm test:coverage # Run tests and generate coverage reports
pnpm perf:bundle # Build web and enforce deterministic bundle budgets
pnpm perf:db     # Profile an isolated deterministic PostgreSQL fixture
pnpm security:audit   # Audit production dependencies for high/critical advisories
pnpm security:secrets # Scan tracked/unignored text for high-risk secret shapes
pnpm test:security    # Run focused security tests, including real Redis/PostgreSQL
pnpm observability:test # Run logger, privacy, tracing, metrics, and request tests
pnpm observability:config:check # Validate Collector, Prometheus, and alert rules
pnpm observability:overhead # Compare local API latency with OTel off/on
pnpm check      # Run lint, typecheck, tests, and build
pnpm ci:verify  # Approximate mandatory non-container CI gates locally
pnpm infra:fmt      # Check Terraform formatting
pnpm infra:validate # Initialize and validate both Terraform roots
pnpm infra:test     # Run focused mock-provider architecture tests
```

Local services:

- Web: <http://127.0.0.1:3000>
- API health: <http://127.0.0.1:4000/health>

## CI/CD

GitHub Actions runs stable Quality, Database, Integration, Security, Docker, and Terraform
checks for pull requests and trusted main/tag pushes. `CI / Gate` is the single
required aggregate check. Only a successful trusted push may publish immutable
web, API/worker, and migration images to GHCR; images include BuildKit SBOM and
provenance. A separate manual, protected AWS workflow promotes exact digests by
OIDC, runs migrations first, and then rolls ECS services. See
[CI/CD and supply-chain delivery](docs/ci-cd.md) and
[AWS production deployment](docs/aws-deployment.md).

## API configuration

The API validates configuration during startup. Its supported variables and
defaults are:

```dotenv
NODE_ENV=development
PORT=4000
DATABASE_URL=postgresql://tripforge:tripforge@127.0.0.1:5433/tripforge
WEB_ORIGIN=http://127.0.0.1:3000
REDIS_URL=redis://127.0.0.1:6379
SECURITY_RATE_LIMITING_ENABLED=true
OPENROUTESERVICE_API_KEY=
S3_BUCKET=tripforge-documents
S3_REGION=us-east-1
S3_ENDPOINT=http://127.0.0.1:4566
S3_PUBLIC_ENDPOINT=http://localhost:4566
S3_FORCE_PATH_STYLE=true
```

These are local development defaults. Production accepts either an explicit
`DATABASE_URL` or the complete `DATABASE_HOST/PORT/NAME/USER/PASSWORD` set;
the modes cannot be mixed. AWS uses the discrete set with `DATABASE_SSL=true`,
an exact `WEB_ORIGIN`, and authenticated `rediss://`. The browser app uses
`NEXT_PUBLIC_API_URL=http://127.0.0.1:4000` and
`NEXT_PUBLIC_S3_UPLOAD_ORIGIN=http://localhost:4566` for the exact direct-upload
CSP destination. Set `NEXT_PUBLIC_MAPTILER_KEY` to a MapTiler browser key to
enable Trip maps and itinerary place search; without it
the workspace keeps working and shows controlled provider-unavailable states.
All `NEXT_PUBLIC_*` values are
embedded into the web build and are not secrets. Restrict MapTiler keys to the
allowed frontend origin and use separate development and production keys.
Environment files are optional for local development; use
`apps/api/.env.example` and `apps/web/.env.example` as starting points when
overriding the defaults. Keep the hostname style consistent between both
applications during cookie testing. See [Maps](docs/maps.md) for provider and
key details and [Place search](docs/place-search.md) for autocomplete,
persistence, attribution, and provider-terms decisions. See
[Routing](docs/routing.md) for the server-secret model, snapshot lifecycle,
concurrency boundary, ORS errors, and attribution. See
[Reservations](docs/reservations.md) for booking lifecycle, local schedule
semantics, typed transport details, and itinerary-link behavior. See
[Expenses](docs/expenses.md) for exact minor-unit money, historical participant
lifecycle, per-currency balances, and the no-FX boundary. See
[Documents](docs/documents.md) for private object storage, presigned URLs,
two-phase uploads, and distributed deletion. See
[Background jobs](docs/background-jobs.md) for the outbox, BullMQ scheduling,
at-least-once processing, retries, and failure recovery. See
[Realtime collaboration](docs/realtime.md) for authenticated Trip rooms,
best-effort invalidations, presence, reconnect semantics, and Redis Streams
fan-out. See [Notifications](docs/notifications.md) for inbox durability,
transactional fan-out, cursor pagination, snapshots, and optimistic read state.
See [Trip-wide search](docs/search.md) for indexed fields, ranking, access scope,
browser behavior, and intentionally deferred search features.
See [Accessibility](docs/accessibility.md) for the WCAG 2.2 AA target, automated
coverage, implementation decisions, known limitations, and manual QA checklist.
See [Performance](docs/performance.md) for the measured bundle baseline, Core Web
Vitals targets, database fixture and plans, rejected optimizations, and repeatable
profiling commands.
See [Security hardening](docs/security-hardening.md) for the ASVS 5.0.0-informed
threat review, distributed limits, CSP/header policy, secrets inventory, known
limitations, and reusable pre-release checklist.
See [Production observability](docs/observability.md) for logs, metrics, traces,
privacy/cardinality policy, PromQL, alerts, and incident runbooks.
See [AWS production deployment](docs/aws-deployment.md) and
[infrastructure operations](infra/README.md) for VPC/ECS/RDS/Redis/S3,
Terraform state, cost profiles, OIDC promotion, rollback, and cloud QA.

The separate worker validates the database/S3 settings above plus `REDIS_URL`;
it does not require `WEB_ORIGIN`. The API opens an independently configured
realtime Redis connection, but Redis availability is not part of HTTP health
and does not gate REST startup or mutations.

## Testing and quality

Web component tests use Vitest, jsdom, and React Testing Library. API unit tests
use Vitest; HTTP integration tests use Nest testing utilities and Supertest.
Coverage is available in the terminal and as HTML reports under each tested
application's `coverage/` directory.

Coverage is observed during early development but is not yet used as a global
quality gate. Thresholds will be introduced when the domain and test architecture
are sufficiently mature.

Browser E2E tests are intentionally deferred to a later stage.

## Trips dashboard

Authenticated users can manage persisted Trips at
<http://127.0.0.1:3000/trips>. The dashboard uses TanStack Query for remote
state and URL-driven pagination. Create and edit forms use React Hook Form and
Zod; PostgreSQL and backend validation remain authoritative.

See [Server state](docs/server-state.md) for query keys, cache rules, and the
client/server-state boundary.

## Docker runtime

Docker provides a reproducible production-like runtime. Normal development
should continue to use the faster native application workflow with PostgreSQL
provided by Docker:

```bash
docker compose up -d db
pnpm db:migrate
pnpm dev
```

Build and start both production containers with:

```bash
export LOCALSTACK_AUTH_TOKEN=<your-localstack-token>
docker compose up --build -d
```

LocalStack releases from `2026.03.0` onward require an account token, including
the pinned `2026.08.3` image. Keep this token in the shell or an uncommitted
Compose `.env`; never commit it. CI must use its own CI auth token.

Local Docker endpoints:

- Web: <http://127.0.0.1:3100>
- API health: <http://127.0.0.1:4000/health>
- PostgreSQL: `127.0.0.1:5433` (loopback only)
- LocalStack S3: <http://127.0.0.1:4566>

Redis is internal to the Compose network and has no host-published port. The
worker has no HTTP port; `docker compose ps` reports its CLI healthcheck.

See [Docker runtime](docs/docker.md) for architecture, inspection, and shutdown
commands, and [Database foundation](docs/database.md) for the schema and
migration workflow.

## Local observability

The explicit overlay adds Collector `0.162.0`, Prometheus `3.15.0`, and Jaeger
`2.21.0` without changing the base stack:

```bash
docker compose -f compose.yaml -f compose.observability.yaml up --build
```

- Prometheus: <http://127.0.0.1:9090>
- Jaeger: <http://127.0.0.1:16686>

For API/web telemetry without the licensed LocalStack runtime, start only `db`,
`redis`, `migrate`, `api`, `web`, `otel-collector`, `prometheus`, and `jaeger`.
See the observability guide for the exact command and architecture-specific
Collector image override.
