# Trip calendar

## Persisted structure

```text
Trip
├── TripDestination (ordered planning place)
└── TripDay (stable identity for one calendar date)
      └── optional primary TripDestination from the same Trip
```

Trip dates are the source of the calendar range. `TripDay` rows persist that
derived range because future itinerary items need stable Day identities and
database relationships; generating Days only in the UI would provide neither.
Dates use PostgreSQL `date` and `YYYY-MM-DD` calendar semantics, not local
midnight timestamps.

## Lifecycle and reconciliation

A complete range creates one Day per date, inclusive. If either boundary is
missing, the Trip has no Days. Trip create inserts the Trip and its initial Days
in one transaction.

Date update is a set reconciliation inside the authorized Trip-update
transaction:

1. Update the owner/editor-accessible Trip.
2. Delete Days whose dates are outside the desired range.
3. Insert missing desired dates with conflict protection.
4. Commit all changes together.

Rows whose dates overlap retain their IDs and destination assignments. Name-only
Trip updates do not touch Days. Any failure rolls back both Trip dates and Day
changes.

## Destination ordering and integrity

Destinations append at `max(position) + 1`; listing uses `position ASC, id ASC`.
Reorder receives every current ID exactly once and normalizes positions to
`0..n-1` transactionally. `(trip_id, position)` is deliberately not unique:
temporary/concurrent collisions are permitted until realtime ordering requires a
stronger design, while UUID ordering provides a deterministic tie-breaker.

`trip_days (trip_id, destination_id)` references
`trip_destinations (trip_id, id)`. Service lookup gives a safe scoped error and
the composite foreign key provides defense in depth. Destination deletion first
clears all affected Day assignments and then deletes the destination in one
transaction; the restrictive FK prevents dangling references.

## Current date-change caveat

Removing dates deletes their corresponding Day rows. Clearing either boundary
deletes all Days but leaves destinations intact. This is acceptable while Days
contain only a nullable destination assignment. Before Stage 13 or later permits
valuable itinerary children, product semantics for destructive range edits must
be reconsidered rather than silently deleting that content.
