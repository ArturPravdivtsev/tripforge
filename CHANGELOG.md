# Changelog

TripForge uses Semantic Versioning for application/source releases. Internal
private workspaces are implementation modules and are not independently
published npm packages.

## [1.0.0]

### Added

- Collaborative Trips with owner/editor/viewer RBAC, itinerary Days, routes,
  reservations, shared expenses, private documents, notifications and search.
- Accessible pointer, keyboard and non-drag itinerary planning flows.
- Permission-scoped realtime freshness and a grounded, read-only AI assistant
  whose proposed changes require explicit user approval.

### Engineering

- Next.js/React client, NestJS API, PostgreSQL/Drizzle persistence, Redis-backed
  realtime and queues, and a worker sharing the API runtime image.
- Deterministic unit, component, accessibility, PostgreSQL/Testcontainers,
  Chromium E2E, performance, observability and AI evaluation gates.
- `1.0.0` is the canonical product/source identity; private workspace packages
  remain internally versioned and are not published to npm.

### Security

- Opaque revocable sessions, current-database authorization, CSP/origin mutation
  controls, secret scans and SHA-pinned CI dependencies.
- One exact development-only `braces` advisory exception remains time-bounded to
  2026-11-01; deployable runtime artifacts were verified not to contain it.
- Runtime images install Debian's fixed `libpcre2-8-0 10.42-1+deb12u2` security
  revision for `CVE-2026-103111`.
- Fixable HIGH/CRITICAL container findings remain release-blocking.

### Reliability

- Transactional PostgreSQL truth, outbox-backed cleanup, idempotent migrations,
  readiness checks, recovery drills and bounded load/soak qualification.
- Immutable digest handoff keeps application rollback distinct from schema
  rollback.

### Infrastructure

- Three OCI artifacts (web, API/worker and migrate) with GHCR digest identity,
  BuildKit SBOM/provenance, release manifest and checksum automation.
- Terraform maps the system to ECS, RDS, ElastiCache and private S3; real AWS
  deployment qualification remains pending.

### AI

- Grounded Trip context, constrained read-only tools, streamed responses,
  cancellation, explicit proposal preview/apply and deterministic evaluations.
- Live OpenAI provider qualification remains separate from deterministic tests.

### Known limitations

- Real AWS deployment/recovery and live OpenAI, ORS and MapTiler qualification
  are pending.
- Manual VoiceOver/Safari, 200%/400% zoom and text-spacing QA remain pending.
- Small Stage 31 client/harness heap median drift remains under observation; it
  is not evidence of a confirmed memory leak.
- Unfixed base-image OS findings remain monitored and are not described as fixed.

[1.0.0]: docs/releases/v1.0.0.md
