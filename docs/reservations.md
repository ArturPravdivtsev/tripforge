# Reservations

## Domain boundary

A reservation is structured evidence of what has been booked. An
`ItineraryItem` describes what the group plans to do. The optional link between
them is a reference, not shared ownership or lifecycle coupling.

```text
Trip
├── ItineraryItem
└── TripReservation ── optional link ──> ItineraryItem
        │
        └── 0..1 ReservationTransportDetails
```

Deleting a Trip cascades to its reservations. Deleting an itinerary item uses
`ON DELETE SET NULL`: the booking survives and becomes unlinked. Deleting a
reservation cascades to its transport detail. A cancelled reservation remains
as useful history; hard delete removes only the TripForge record.

## Relational model

`trip_reservations` stores common fields for accommodation, transport,
restaurant, activity, and other bookings. Kind and status are PostgreSQL enums;
statuses are `pending`, `confirmed`, and `cancelled`. The table has indexes for
Trip lookup, itinerary linkage, and deterministic schedule ordering.

`reservation_transport_details` is a typed one-to-one subtype. Its
`reservation_id` is both primary key and cascading foreign key. It stores mode,
operator, service number, origin, and destination. This avoids an opaque JSON
blob and avoids adding transport-only nullable columns to every reservation.

The cross-table invariant is enforced by application transactions:

```text
kind = transport  -> exactly one transport-detail row
kind != transport -> no transport-detail row
```

PostgreSQL constraints protect each table independently, but direct SQL can
bypass this cross-table application invariant. API create/update integration
tests prove the supported boundary cannot.

## Local schedule semantics

Dates are PostgreSQL `date`; times are `time without time zone`. The API uses
`YYYY-MM-DD` and strict `HH:mm`. Values are local booking-calendar snapshots and
never pass through JavaScript `Date` or pretend to identify a UTC instant.

- `start_date` is required; `start_time` is optional.
- `end_date` and `end_time` are optional, but an end time requires an end date.
- End date cannot precede start date.
- When both times exist on the same date, end time cannot precede start time.
- Dates outside the Trip range are allowed and shown as informational warnings.
- Reservations never create Days, itinerary items, or change Trip dates.

Timezone-aware provider imports are intentionally deferred until TripForge has
a complete timezone model.

## Mutations and transactions

Create validates the complete normalized state and writes the core row plus
optional subtype in one transaction. PATCH loads the existing reservation,
merges omitted fields, validates the resulting state, then atomically updates
the core and inserts/replaces/deletes the subtype. An empty PATCH returns
`EMPTY_RESERVATION_UPDATE`; incompatible subtype state returns
`INVALID_RESERVATION_DETAILS`.

A simple reservation DELETE is one SQL statement. Its foreign-key cascade
removes the subtype, so an extra explicit transaction adds no atomicity.

Linked itinerary IDs are resolved within the parent Trip on create and update.
Missing and foreign IDs both return scoped `ITINERARY_ITEM_NOT_FOUND`.

## Permissions and privacy

Owner/editor can read and mutate reservations. Viewer can read them, including
confirmation codes. Unrelated users receive `TRIP_NOT_FOUND`; foreign or missing
reservation IDs within an accessible Trip receive `RESERVATION_NOT_FOUND`.
Confirmation codes are shared Trip data and must not be exposed outside Trip
access control.

Changing status to cancelled only updates TripForge. It does not contact a
hotel, airline, restaurant, railway, or other provider. Stage 17 contains no
provider APIs, email parsing, attachments, expenses, payments, notifications,
background jobs, or automatic itinerary creation.
