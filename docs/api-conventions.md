# API conventions

## Routes

Product routes use the `/api/*` prefix. Infrastructure routes may remain outside
that prefix; `/health` is intentionally available at the root for load balancers
and platform health checks.

URI/API versioning is deferred until TripForge has a real compatibility
requirement.

## DTOs and validation

HTTP input uses concrete DTO classes so decorators can perform runtime
validation. A global `ValidationPipe` transforms payloads, keeps only declared
DTO properties, and rejects unknown properties with a validation error.

## Errors

API failures use normal HTTP status codes and a stable envelope:

```json
{
  "statusCode": 404,
  "code": "NOT_FOUND",
  "message": "Cannot GET /api/example",
  "path": "/api/example",
  "timestamp": "2026-09-08T12:00:00.000Z"
}
```

Validation failures use `VALIDATION_ERROR` and may add an `errors` array.
Unexpected failures return a generic 500 message; internal details and stack
traces are never included in the response.

## Request lifecycle

```text
Request
  -> Middleware
  -> Guards
  -> Interceptors
  -> Pipes / Validation
  -> Controller
  -> Service
  -> Interceptors
  -> Response
```

Errors leave the normal flow and are normalized by exception filters. Custom
middleware, guards, and interceptors will be introduced only when real use cases
appear.

## Browser origin policy

`WEB_ORIGIN` is a required exact HTTP(S) origin in production and defaults to
`http://127.0.0.1:3000` locally. Credentialed CORS reflects only that exact
origin, allows `GET`, `POST`, `PATCH`, `DELETE`, and `OPTIONS`, and allows the
`Content-Type` and `X-TripForge-Request` request headers. Wildcard origins are
intentionally not used with credentials.

Browser mutations require exact `Origin` and `X-TripForge-Request: 1`. Missing
or mismatched proof returns `403 CSRF_PROTECTION_FAILED`. Register, login, Trip,
member, destination, Day, itinerary, route, reservation, expense, and document
JSON mutations require `application/json`, otherwise they return `415
UNSUPPORTED_MEDIA_TYPE`. Safe `GET` requests do not require the mutation header;
bodyless logout and DELETE requests do not require a content type. Browser PUTs
to a presigned object-storage URL are outside the session API boundary and send
only the signed `Content-Type` plus file bytes.

## Shared transport contracts

`@tripforge/contracts` contains wire types and focused pure cross-runtime money
helpers shared by the Nest API and Next browser app. It does
not contain React components, Nest controllers, database/ORM models, or business
services.

## Resource operations

Trip resources use conventional HTTP semantics:

| Operation | Method and route | Success |
| --- | --- | --- |
| list accessible trips | `GET /api/trips` | `200` page |
| read accessible trip | `GET /api/trips/:tripId` | `200` trip |
| create trip | `POST /api/trips` | `201` trip |
| partially update trip | `PATCH /api/trips/:tripId` | `200` trip |
| hard-delete trip | `DELETE /api/trips/:tripId` | `204` empty body |
| list participants | `GET /api/trips/:tripId/members` | `200` participants |
| add existing-account member | `POST /api/trips/:tripId/members` | `201` participant |
| change member role | `PATCH /api/trips/:tripId/members/:userId` | `200` participant |
| remove member | `DELETE /api/trips/:tripId/members/:userId` | `204` empty body |
| list destinations | `GET /api/trips/:tripId/destinations` | `200` destinations |
| create destination | `POST /api/trips/:tripId/destinations` | `201` destination |
| update destination name and/or coordinate pair | `PATCH /api/trips/:tripId/destinations/:destinationId` | `200` destination |
| delete destination | `DELETE /api/trips/:tripId/destinations/:destinationId` | `204` empty body |
| reorder destinations | `PATCH /api/trips/:tripId/destinations/reorder` | `200` destinations |
| list Days | `GET /api/trips/:tripId/days` | `200` Days |
| assign/clear Day destination | `PATCH /api/trips/:tripId/days/:dayId` | `200` Day |
| list itinerary | `GET /api/trips/:tripId/itinerary-items` | `200` items |
| append itinerary item | `POST /api/trips/:tripId/itinerary-items` | `201` item |
| update itinerary item | `PATCH /api/trips/:tripId/itinerary-items/:itemId` | `200` item |
| delete itinerary item | `DELETE /api/trips/:tripId/itinerary-items/:itemId` | `204` empty body |
| reorder/move itinerary items | `PATCH /api/trips/:tripId/itinerary-items/reorder` | `200` items |
| list reservations | `GET /api/trips/:tripId/reservations` | `200` reservations |
| create reservation | `POST /api/trips/:tripId/reservations` | `201` reservation |
| read reservation | `GET /api/trips/:tripId/reservations/:reservationId` | `200` reservation |
| update reservation | `PATCH /api/trips/:tripId/reservations/:reservationId` | `200` reservation |
| delete reservation record | `DELETE /api/trips/:tripId/reservations/:reservationId` | `204` empty body |
| list expenses | `GET /api/trips/:tripId/expenses` | `200` expenses |
| create expense | `POST /api/trips/:tripId/expenses` | `201` expense |
| read expense balances | `GET /api/trips/:tripId/expenses/balances` | `200` currency groups |
| read expense | `GET /api/trips/:tripId/expenses/:expenseId` | `200` expense |
| update expense | `PATCH /api/trips/:tripId/expenses/:expenseId` | `200` expense |
| delete expense | `DELETE /api/trips/:tripId/expenses/:expenseId` | `204` empty body |
| list ready documents | `GET /api/trips/:tripId/documents` | `200` documents |
| initialize document upload | `POST /api/trips/:tripId/documents/uploads` | `201` pending document and presigned PUT |
| complete document upload | `POST /api/trips/:tripId/documents/:documentId/complete` | `201` ready document |
| request document download | `GET /api/trips/:tripId/documents/:documentId/download` | `200` presigned GET |
| update document metadata/link | `PATCH /api/trips/:tripId/documents/:documentId` | `200` document |
| delete document metadata and enqueue durable object cleanup | `DELETE /api/trips/:tripId/documents/:documentId` | `204` empty body |

All routes require the existing server session. Ownership is derived from
`trips.owner_id`, and editor/viewer access from `trip_members`; neither comes from
client input or session claims. Trip responses include the current user's
effective `accessRole`. A known member lacking a capability receives `403
INSUFFICIENT_TRIP_PERMISSION`; an unrelated user or nonexistent Trip receives
`404 TRIP_NOT_FOUND`. Member management is owner-only.

Destination and Day reads allow every accessible role. Their mutations allow
owners and editors; viewers receive `403 INSUFFICIENT_TRIP_PERMISSION`. Unknown
children of an accessible Trip return `DESTINATION_NOT_FOUND` or
`TRIP_DAY_NOT_FOUND`. Day creation/deletion is not exposed: the Trip date range
owns that lifecycle. Destination reorder accepts the complete ID set and rejects
duplicates, omissions, unknown IDs, or foreign IDs with
`400 INVALID_DESTINATION_ORDER`.

Itinerary reads allow every accessible role; writes allow owners and editors.
Items are scoped through their Day to the parent Trip. Reorder accepts the
complete desired contents of every affected Day and rejects duplicates,
omissions, unknown/foreign IDs, and cross-Trip moves with `400
INVALID_ITINERARY_ORDER`. Empty item PATCH requests return `400
EMPTY_ITINERARY_ITEM_UPDATE`. A date update that would remove a populated Day
returns `409 TRIP_DATE_CHANGE_WOULD_REMOVE_ITINERARY` without changing state.

Trip collections use one-based offset pagination. `page` defaults to `1`;
`pageSize` defaults to `20` and is capped at `100`. Responses include `items`,
`page`, `pageSize`, `total`, and `totalPages`; an empty collection has
`totalPages: 0`. Ordering is deterministic: `created_at DESC, id DESC`.

Reservation reads allow every accessible role; mutations allow owners and
editors. Lists order by `start_date ASC`, `start_time ASC NULLS LAST`,
`created_at ASC`, then `id ASC`. Unknown/foreign reservation IDs return scoped
`RESERVATION_NOT_FOUND`. PATCH validates the complete merged state so subtype or
schedule changes cannot leave a partial model. `cancelled` is a status update,
not provider-side cancellation or record deletion.

Expense reads and balances allow every accessible role; mutations allow owners
and editors. Lists order by `spent_on DESC`, `created_at DESC`, then `id DESC`.
Unknown/foreign expense IDs return scoped `EXPENSE_NOT_FOUND`; foreign
participants and reservations are rejected without exposing another Trip.
Amounts and shares are safe integers in minor units. Split-total and participant
lifecycle rules are validated over the final aggregate before a transaction
commits. Balances and deterministic settlements are derived per currency and
never perform FX conversion.

Document list/download reads allow every accessible role; upload, complete,
update, and delete allow owners and editors. Initialization validates the
allowlisted MIME type, declared byte size, metadata, and same-Trip optional link,
then returns a short-lived presigned PUT. Completion performs an authoritative
object HEAD and publishes only when content type and size exactly match. Pending
rows are never listed or downloadable. Downloads use short-lived attachment
URLs; storage keys and credentials are never returned. Unknown/foreign document
or link IDs use scoped `404` errors. Delete removes metadata first and then
attempts best-effort object cleanup so authorization cannot survive a storage
outage.
