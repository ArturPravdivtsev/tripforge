# TripForge

TripForge is a collaborative travel planner. This repository currently contains
the monorepo and automated testing foundations.

## Structure

```text
apps/
  web/                  Next.js web application
  api/                  NestJS API
packages/
  contracts/            Shared API contracts (currently empty)
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

- Web: <http://localhost:3000>
- API health: <http://localhost:4000/health>

## API configuration

The API validates configuration during startup. Its supported variables and
defaults are:

```dotenv
NODE_ENV=development
PORT=4000
```

An `.env` file is optional for local development. Use `apps/api/.env.example`
as the starting point when overriding these defaults.

## Testing and quality

Web component tests use Vitest, jsdom, and React Testing Library. API unit tests
use Vitest; HTTP integration tests use Nest testing utilities and Supertest.
Coverage is available in the terminal and as HTML reports under each tested
application's `coverage/` directory.

Coverage is observed during early development but is not yet used as a global
quality gate. Thresholds will be introduced when the domain and test architecture
are sufficiently mature.

Browser E2E tests are intentionally deferred to a later stage.
