# Itinerary

## Model

An `ItineraryItem` belongs to one persisted `TripDay`. Stable Day IDs make plans
relational children rather than client-generated calendar fragments. Items have
one classification (`activity`, `food`, `transport`, `accommodation`, or
`other`), a required title, optional notes, optional local start time, and an
integer position. Kinds classify only; they do not add kind-specific fields.

`start_time` is PostgreSQL `time without time zone`. The API transports strict
24-hour `HH:mm`; it is a local wall-clock label for that Day, not a UTC instant,
timestamp, or JavaScript `Date`. Timezone, end time, and duration are deferred.

## Ordering and movement

Items list by `TripDay.date ASC, position ASC, id ASC`. The UUID tie-breaker
makes position collisions deterministic. `(trip_day_id, position)` is
intentionally not unique because a multi-row reorder can temporarily collide;
the server normalizes every affected list to contiguous `0..N-1` positions.

Same-Day reorder submits one complete Day list. A cross-Day move submits the
complete source and target lists. Before writing, the server locks and validates
that all affected Days belong to the Trip and that the supplied ID union exactly
matches their current item union. Day changes and position updates then commit in
one transaction. Stage 13 uses last successful reorder wins; versions, realtime
locks, CRDTs, and fractional indexes are deferred.

## Deletion boundaries

The database foreign key from `itinerary_items.trip_day_id` uses `ON DELETE
CASCADE`. Explicit owner-only Trip deletion may therefore remove the complete
aggregate. Routine date edits are safer: removed empty Days may disappear, but a
populated removed Day blocks the edit with `409
TRIP_DATE_CHANGE_WOULD_REMOVE_ITINERARY`. The check and reconciliation share the
same transaction and row locks.

## Browser state

The workspace fetches all Trip items once and groups them by real Day IDs.
`DragDropProvider` and `useSortable` provide pointer and default keyboard
interaction through a dedicated focusable handle. Local groups remain stable
during drag. Drag-end performs one optimistic TanStack Query update, snapshots
the full itinerary, sends one reorder request, restores the full snapshot on
failure, and refetches after settlement. No persistence occurs on drag-over.
