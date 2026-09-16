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
or mismatched proof returns `403 CSRF_PROTECTION_FAILED`. Register, login, Trip
create/PATCH, and member POST/PATCH also require `application/json`, otherwise
they return `415 UNSUPPORTED_MEDIA_TYPE`. Safe `GET` requests do not require the
mutation header; bodyless logout and DELETE requests do not require a content type.

## Shared transport contracts

`@tripforge/contracts` contains only wire types shared by the Nest API and Next
browser app, such as auth request, response, user, and error envelopes. It does
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

All routes require the existing server session. Ownership is derived from
`trips.owner_id`, and editor/viewer access from `trip_members`; neither comes from
client input or session claims. Trip responses include the current user's
effective `accessRole`. A known member lacking a capability receives `403
INSUFFICIENT_TRIP_PERMISSION`; an unrelated user or nonexistent Trip receives
`404 TRIP_NOT_FOUND`. Member management is owner-only.

Trip collections use one-based offset pagination. `page` defaults to `1`;
`pageSize` defaults to `20` and is capped at `100`. Responses include `items`,
`page`, `pageSize`, `total`, and `totalPages`; an empty collection has
`totalPages: 0`. Ordering is deterministic: `created_at DESC, id DESC`.
