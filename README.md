# TripForge

TripForge is a collaborative travel planner. This repository currently contains
the Stage 1 monorepo foundation only.

## Structure

```text
apps/
  web/                  Next.js web application
  api/                  NestJS API
packages/
  contracts/            Shared API contracts (currently empty)
  eslint-config/        Shared ESLint configuration
  typescript-config/    Shared TypeScript configuration
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
```

Local services:

- Web: <http://localhost:3000>
- API health: <http://localhost:4000/health>
