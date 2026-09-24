# Trips domain

## Relational model

```text
User ───── owns ─────> Trip
  \                    /
   \── TripMember ───/
        editor | viewer

Trip
├── owns many TripDestination
│
├── owns many TripDay
               │
               ├── optional primary TripDestination
               └── owns many ordered ItineraryItem
│
└── owns many TripReservation
               ├── optionally references ItineraryItem
               └── optionally owns one TransportReservationDetails
│
└── owns many TripExpense
               ├── optionally references TripReservation
               ├── references one payer User
               └── owns one or more TripExpenseSplit → User
│
└── owns many TripDocument
               ├── optionally references one itinerary item, reservation, or expense
               ├── references the uploader User
               └── stores private bytes in S3-compatible object storage
```

`trips.owner_id` is the single source of truth for ownership. The owner is never
duplicated in `trip_members`; participants responses synthesize that row from the
Trip and its user. `trip_members` is a many-to-many join table whose composite
primary key `(trip_id, user_id)` permits one role per user and Trip. Both foreign
keys cascade on deletion, and `user_id` has an index for accessible-Trip queries.

The database enum contains only `editor` and `viewer`. `owner` is an effective
transport role derived from `trips.owner_id`, not a stored membership value.

## Authorization

| Capability | Owner | Editor | Viewer |
| --- | :---: | :---: | :---: |
| List/read Trip | ✓ | ✓ | ✓ |
| Update Trip | ✓ | ✓ | — |
| Delete Trip | ✓ | — | — |
| View participants | ✓ | ✓ | ✓ |
| Add/change/remove members | ✓ | — | — |
| Read destinations and Days | ✓ | ✓ | ✓ |
| Create/update/delete/reorder destinations | ✓ | ✓ | — |
| Assign a destination to a Day | ✓ | ✓ | — |
| Read itinerary items | ✓ | ✓ | ✓ |
| Create/update/delete/reorder itinerary items | ✓ | ✓ | — |
| Read reservations and confirmation codes | ✓ | ✓ | ✓ |
| Create/update/delete reservations | ✓ | ✓ | — |
| Read expenses, balances, and settlements | ✓ | ✓ | ✓ |
| Create/update/delete expenses | ✓ | ✓ | — |
| List/download ready documents | ✓ | ✓ | ✓ |
| Upload/update/delete documents | ✓ | ✓ | — |

Authentication establishes the user identity only. Every request resolves the
current Trip permission from PostgreSQL, so downgrade and revocation take effect
without a new login. Roles and Trip IDs are not stored in auth sessions.
The same rule applies to WebSocket rooms: every `trip:join` performs a fresh
database permission check. A downgrade keeps read access and triggers a cache
refetch; removal targets the user and force-evicts their sockets from the Trip
room across API nodes. Rejoining with the still-valid login is denied without
requiring a relogin.

List/get queries are access-scoped in SQL and return `accessRole`. PATCH itself
is constrained to owner or editor, and DELETE itself is constrained to owner.
Known members with insufficient rights receive `403
INSUFFICIENT_TRIP_PERMISSION`; unrelated users and missing Trips receive `404
TRIP_NOT_FOUND` to preserve anti-enumeration behavior.

## Membership rules

- Only an owner manages members.
- Add-member accepts a normalized email (`trim + lowercase`) for an existing
  TripForge account. It does not create accounts or invitations.
- An owner cannot be added as a member or removed through member endpoints.
- POST never overwrites an existing membership; PATCH changes `role` and
  explicitly updates `updated_at`.
- Adding a member is one atomic SQL INSERT, so no explicit transaction is needed.
- Ownership transfer, pending invitations, and role history are deferred.

The existing-account lookup intentionally reveals to an authenticated Trip owner
whether a specific email is registered. This is a known Stage 11 privacy tradeoff;
a future invitation lifecycle can remove the prior-account requirement.

## Trip data rules

- Names are trimmed and contain 1–200 characters.
- `startsOn` and `endsOn` are nullable `YYYY-MM-DD` calendar dates.
- When both dates exist, `endsOn >= startsOn` in service validation and a
  PostgreSQL check constraint.
- Lists use access-scoped offset pagination ordered by `created_at DESC, id DESC`.
- A complete inclusive date range owns one persisted `trip_days` row per calendar
  date. A partial range owns no Days; destinations remain available for planning.
- Date edits reconcile Days by date. Overlapping dates retain their stable Day
  IDs and destination assignments; only removed dates are deleted and new dates
  are inserted. A removed Day containing itinerary items instead blocks the
  update with `409 TRIP_DATE_CHANGE_WOULD_REMOVE_ITINERARY`.
- Destinations are ordered by `position ASC, id ASC`. Position collisions are
  allowed intentionally; mutations normalize the full order and the UUID is a
  deterministic tie-breaker. Concurrency-perfect ordering is deferred until
  realtime collaboration exists.
- Destinations optionally store a `double precision` latitude/longitude pair.
  Both values are null for a text-only destination or both are present;
  PostgreSQL enforces the pair and latitude/longitude ranges. Name-only PATCH
  leaves coordinates unchanged, a numeric pair sets them, and a null pair
  clears only the location.
- A composite foreign key from Day `(trip_id, destination_id)` to destination
  `(trip_id, id)` makes cross-Trip assignments impossible at the database layer.

The calendar lifecycle and its current destructive-edit caveat are detailed in
[Trip calendar](./trip-calendar.md).

Itinerary persistence, wall-clock time, and ordering are detailed in
[Itinerary](./itinerary.md).

Map rendering and browser-only interaction state are detailed in
[Maps](./maps.md).

Booking lifecycle, typed transport details, local wall-clock schedules, and the
intentional itinerary `SET NULL` relationship are detailed in
[Reservations](./reservations.md).

Exact money, split invariants, balances, settlements, and historical financial
participation are detailed in [Expenses](./expenses.md). Membership removal does
not delete or rewrite payer/share history, and reservation deletion only clears
the optional expense link.

Private file metadata and authorization remain in PostgreSQL while file bytes
remain in S3-compatible object storage. A document may link to at most one
same-Trip itinerary item, reservation, or expense. Deleting a linked resource
clears that link; deleting a membership does not erase the uploader identity.
The pending-to-ready lifecycle and cleanup tradeoffs are detailed in
[Documents](./documents.md).

Committed mutations publish best-effort resource invalidations only after their
repository operation returns. They do not publish entity snapshots or create a
second write path. Ordinary concurrent writes remain last-committed-write-wins,
subject to existing transaction and conflict rules. See
[Realtime collaboration](./realtime.md) for the mutation matrix and presence.
