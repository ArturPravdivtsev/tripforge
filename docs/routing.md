# Routing

## Architecture

```text
Browser
  -> TripForge Nest API
  -> openrouteservice Directions API
  -> normalized LineString/distance/duration
  -> PostgreSQL trip_route_segments snapshot
  -> browser on later reads
```

TripForge uses openrouteservice through
`https://api.heigit.org/openrouteservice/v2/directions/{profile}/geojson`.
The previous `api.openrouteservice.org` host is not used. Supported TripForge
modes map on the server only: `walking -> foot-walking`, `cycling ->
cycling-regular`, and `driving -> driving-car`. Requests contain exactly two
`[longitude, latitude]` coordinates and request no turn-by-turn instructions.

`OPENROUTESERVICE_API_KEY` is an optional, server-only API configuration value.
It is never exposed through `NEXT_PUBLIC_*`, browser bundles, API responses, or
logs. When absent, saved routes remain readable and the API remains healthy;
explicit create/recalculate requests return `503
ROUTING_PROVIDER_UNAVAILABLE`. API runtime receives the value in Compose; the
web build and runtime do not.

## Snapshot and concurrency model

The provider client uses Node `fetch`, a 9-second timeout, focused runtime
validation, and stable application error mapping. Only normalized GeoJSON
`LineString`, rounded meters/seconds, the mode, and endpoint coordinate snapshots
are persisted. Raw ORS responses and instructions are discarded. Reloading or
rendering a route performs no ORS request.

External HTTP never runs inside a database transaction:

```text
authorize -> read endpoint coordinates -> ORS request
-> short transaction -> SELECT endpoints FOR UPDATE
-> compare exact coordinate snapshots -> insert/update -> commit
```

If either coordinate changed during HTTP, persistence fails with `409
ROUTE_ENDPOINT_CHANGED`. The transaction does not prevent place edits while ORS
is running; it prevents stale geometry from being committed afterward.
Same-Trip membership is enforced through scoped lookup plus transactional
revalidation rather than a complex composite-FK redesign.

Changing or clearing an itinerary place's coordinates deletes all referencing
routes in the same transaction as the item update. Name, address, provider
reference, Day, or position changes with unchanged coordinates preserve routes.
Endpoint and Trip deletion use database cascades.

## Provider errors and quota

- timeout, authentication failure, network failure, or 5xx -> `503 ROUTING_PROVIDER_UNAVAILABLE`;
- 429 -> `503 ROUTING_PROVIDER_RATE_LIMITED`;
- no route -> `422 ROUTE_NOT_FOUND`;
- malformed provider data -> `503 INVALID_ROUTING_RESPONSE`.

Provider bodies and account quota details do not cross the API boundary.
Provider calls occur only on explicit create or recalculate mutations—never on
workspace load, query refetch, itinerary reorder, map movement, or a schedule.

## License and attribution

Provider documentation and conditions were reviewed on **2026-09-18**. ORS API
results are described as CC-BY 4.0 and require visible attribution when rendered:

```text
© openrouteservice.org by HeiGIT
Map data © OpenStreetMap contributors
```

The route-map overlay shows that attribution alongside the existing MapTiler
attribution. Provider terms and endpoints can change; re-review them before a
public production launch.

References:

- <https://giscience.github.io/openrouteservice/api-reference/endpoints/directions/requests-and-return-types>
- <https://openrouteservice.org/dev/>
- <https://openrouteservice.org/terms-of-service/>

## Deliberate limits

No transit, straight-line fallback, alternatives, Matrix API, optimization,
traffic, route history, turn-by-turn navigation, background refresh, PostGIS, or
frontend ORS SDK is included. A saved route is a user-triggered planning
snapshot, not active navigation guidance.
