# Testing strategy

TripForge follows a testing pyramid: most checks should be fast unit and
component tests, with progressively fewer integration and browser tests.

```text
             Browser E2E
               few tests
                  /\
                 /  \
          HTTP / Integration
                 tests
               /      \
              /        \
        Unit / Component
             many tests
```

## Testing layers

- **Unit tests:** pure domain logic, services, helpers, and isolated controllers.
- **Component tests:** React components and user interactions without a real
  browser or backend.
- **Integration/API tests:** Nest modules, routing, validation, and persistence
  boundaries. Authentication runs against ephemeral PostgreSQL 18.6 through
  Testcontainers and applies the real committed Drizzle migrations. Trips
  coverage exercises CRUD, pagination, timestamps, browser mutation policy,
  and cross-user ownership against the same PostgreSQL image.
- **Browser E2E tests:** critical user journeys only. They are not implemented yet.

Stage 8 covers browser authentication with React Testing Library component
tests, mocked Fetch client tests, Nest CORS/browser-policy HTTP tests, real
PostgreSQL authentication integration tests, and manual browser QA. Installing
Playwright remains intentionally deferred.

Stage 10 adds fresh-`QueryClient` component tests for Trips loading, empty,
authentication-required and retryable-error states; URL pagination and retained
page data; create/edit forms; optimistic deletion success and rollback; and
logout cache isolation. Focused client tests cover request URLs, credentials,
mutation headers, JSON bodies, `AbortSignal`, and `204 No Content` handling.

TripForge should avoid testing implementation details and should not rely only
on expensive browser E2E tests.

## Commands

```text
pnpm test
  -> fast unit, component, and non-container HTTP tests

pnpm test:integration
  -> Docker + Testcontainers persistence tests

pnpm check
  -> fast developer gate: lint + typecheck + test + build

pnpm check:full
  -> pnpm check + PostgreSQL integration tests
```

The regular suite must remain usable without Docker. Integration tests use
`@testcontainers/postgresql@12.1.0` and `postgres:18.6-bookworm`; each run gets
an independent database and never touches the developer's Compose volume. The
suite applies committed migrations rather than manually creating tables or
using schema push, truncates test data between cases, and does not depend on
test order. Real PostgreSQL is intentional because transactions, foreign keys,
checks, timestamps, unique violations, and Drizzle behavior are part of the
authentication and Trips contracts.
