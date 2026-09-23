# TripForge

TripForge is a collaborative travel planner. The current product flow supports
browser authentication, collaborative Trips, structured Days and itinerary,
MapTiler-backed optional place search, persisted ORS route snapshots, and a
combined destination/itinerary/route map. Trips also support structured booking
records with optional itinerary links and typed transport details, plus exact
multi-currency expenses, participant splits, balances, and settlement suggestions.
Private Trip documents use direct browser uploads to S3-compatible storage.
Durable background cleanup uses a PostgreSQL transactional outbox, BullMQ v6,
and an AOF-backed Redis worker process.

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
```

## Prerequisites

- Node.js 24 LTS
- Corepack (included with supported Node.js installations)

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
pnpm test:coverage # Run tests and generate coverage reports
pnpm check      # Run lint, typecheck, tests, and build
```

Local services:

- Web: <http://127.0.0.1:3000>
- API health: <http://127.0.0.1:4000/health>

## API configuration

The API validates configuration during startup. Its supported variables and
defaults are:

```dotenv
NODE_ENV=development
PORT=4000
DATABASE_URL=postgresql://tripforge:tripforge@127.0.0.1:5433/tripforge
WEB_ORIGIN=http://127.0.0.1:3000
OPENROUTESERVICE_API_KEY=
S3_BUCKET=tripforge-documents
S3_REGION=us-east-1
S3_ENDPOINT=http://127.0.0.1:4566
S3_PUBLIC_ENDPOINT=http://localhost:4566
S3_FORCE_PATH_STYLE=true
```

These are local development defaults. Production requires an explicit
`DATABASE_URL` and exact `WEB_ORIGIN`. The browser app uses
`NEXT_PUBLIC_API_URL=http://127.0.0.1:4000`. Set `NEXT_PUBLIC_MAPTILER_KEY` to a
MapTiler browser key to enable Trip maps and itinerary place search; without it
the workspace keeps working and shows controlled provider-unavailable states.
Both `NEXT_PUBLIC_*` values are
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
at-least-once processing, retries, and failure recovery.

The separate worker validates the database/S3 settings above plus
`REDIS_URL=redis://127.0.0.1:6379`; it does not require `WEB_ORIGIN`. The HTTP
API intentionally does not require Redis.

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
