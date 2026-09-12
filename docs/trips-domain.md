# Trips domain

## Current model

```text
User
  └── owns many Trips
```

A Trip has a server-generated UUID, owner, name, optional calendar-date bounds,
and creation/update timestamps. API responses omit `ownerId`: every operation is
already scoped to the authenticated owner.

## Rules and authorization

- Names are trimmed at the application boundary and contain 1–200 characters.
- `startsOn` and `endsOn` are independently nullable `YYYY-MM-DD` calendar dates.
- When both dates exist, `endsOn >= startsOn`. The service validates the resulting
  state of partial updates; the PostgreSQL check remains defense in depth.
- Reads and mutations query by trip ID plus current user ID. Foreign and missing
  trips intentionally share `404 TRIP_NOT_FOUND`.
- PATCH distinguishes omitted fields from explicit `null`; `null` clears a date.
- Successful updates explicitly set `updated_at` to the current time.
- Delete is a hard delete and returns `404` when no owned row existed.

Lists use PostgreSQL offset pagination with `created_at DESC, id DESC`. The ID is
the deterministic tie-breaker. Empty lists report `totalPages: 0`. Offset paging
is appropriate for the expected small per-user collection; cursor paging can be
revisited for large or high-churn feeds.

Each create/update/delete is one atomic SQL statement, so no explicit transaction
is needed. Optimistic locking is deferred until collaborative or realtime editing
creates a concrete concurrency requirement. Membership and shared access through
a future `TripMember` concept are also deferred; Stage 9 is owner-only.
