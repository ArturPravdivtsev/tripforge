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
