# Maps

## Responsibilities

TripForge keeps four concerns distinct:

- **TripForge PostgreSQL** is the source of truth for destination coordinates
  and selected itinerary-place snapshots.
- **MapLibre GL JS 6.10.0** is the browser/WebGL rendering engine.
- **react-map-gl 8.1.3** is the React integration around MapLibre's imperative
  map.
- **MapTiler** supplies the basemap style and tiles directly to the browser.

Nest does not proxy map tiles and owns no MapTiler secret. Plain nullable
latitude/longitude columns are sufficient while the server only persists
points. PostGIS becomes useful only when TripForge needs server-side spatial
queries such as nearby search, distance ordering, or bounding-box filtering.

## Browser configuration and key model

Set `NEXT_PUBLIC_MAPTILER_KEY` in the web build environment. It is a
browser-visible API key, not a secret credential. Production protection comes
from MapTiler's allowed-origin restriction, quota monitoring, rotation, and
separate keys per environment:

- allow only `localhost`/`127.0.0.1` origins on a development key;
- allow only the actual deployed frontend origin on the production key;
- never deploy an unrestricted production key.

`NEXT_PUBLIC_*` values are embedded into the frontend build. Changing a key in
an already-built production image therefore requires rebuilding the web
artifact. Missing configuration produces a controlled unavailable state while
the destination list, Days, and itinerary continue to work.

## Runtime architecture

The application-specific `TripMap` is a local Client Component dynamically
loaded with SSR disabled. MapLibre's stylesheet is imported once by the web
layout. Its ES module worker is configured through the webpack-supported
`setWorkerUrl(new URL(..., import.meta.url))` form. The existing
`next build --webpack` path remains authoritative.

The first mapped point receives a city-scale view; multiple points fit to bounds
with padding. Destination markers are larger/order-labelled while itinerary
markers are smaller. Later coordinate-set changes refit once, while pan, zoom,
cross-list marker selection, and the preview pin remain local camera/UI state.
The semantic destination and itinerary lists remain the canonical accessible
representations.

Owner/editor location changes follow `pick → preview → explicit save`; cancel
discards the preview and clear requires confirmation. Viewers can pan, zoom, and
inspect named markers but see no editing controls. Missing keys, WebGL/runtime
errors, and style/tile failures stay isolated from the rest of the workspace.

The current bounds helper intentionally does not attempt antimeridian-perfect
global geometry.

## Stage 15 place search

Destination names remain user-authored and manually pinned. Itinerary items may
instead attach a place selected through MapTiler forward geocoding. The same
browser-visible key is used, and no Nest proxy, reverse geocoder, routes, user
location, or second details lookup exists. The map combines both categories via
a UI-only discriminated `TripMapPoint` union; this is not another persistence
aggregate. See [Place search](place-search.md).
