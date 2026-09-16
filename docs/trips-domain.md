# Trips domain

## Relational model

```text
User ───── owns ─────> Trip
  \                    /
   \── TripMember ───/
        editor | viewer
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

Authentication establishes the user identity only. Every request resolves the
current Trip permission from PostgreSQL, so downgrade and revocation take effect
without a new login. Roles and Trip IDs are not stored in auth sessions.

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
