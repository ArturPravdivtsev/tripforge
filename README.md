# TripForge

TripForge is a collaborative travel planner. The current product flow supports
browser authentication and owner-scoped Trip creation, listing, editing,
pagination, and deletion.

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
```

These are local development defaults. Production requires an explicit
`DATABASE_URL` and exact `WEB_ORIGIN`. The browser app uses
`NEXT_PUBLIC_API_URL=http://127.0.0.1:4000`. Environment files are optional for
local development; use `apps/api/.env.example` and `apps/web/.env.example` as
starting points when overriding the defaults. Keep the hostname style consistent
between both applications during cookie testing.

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
docker compose up --build -d
```

Local Docker endpoints:

- Web: <http://127.0.0.1:3100>
- API health: <http://127.0.0.1:4000/health>
- PostgreSQL: `127.0.0.1:5433` (loopback only)

See [Docker runtime](docs/docker.md) for architecture, inspection, and shutdown
commands, and [Database foundation](docs/database.md) for the schema and
migration workflow.
