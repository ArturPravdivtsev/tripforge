# Maps

## Responsibilities

TripForge keeps four concerns distinct:

- **TripForge PostgreSQL** is the source of truth for destination coordinates
  and selected itinerary-place snapshots.
- **MapLibre GL JS 6.10.0** is the browser/WebGL rendering engine.
- **react-map-gl 8.1.3** is the React integration around MapLibre's imperative
  map.
- **MapTiler** supplies the basemap style and tiles directly to the browser.
- **openrouteservice** calculates route snapshots through Nest only when the user
  explicitly creates or recalculates a route.

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
loaded with SSR disabled. MapLibre's stylesheet is imported by `TripMap`.
Before any map renders, that client module configures the worker once with
`setWorkerUrl('/maplibre/<installed-version>/maplibre-gl-worker.mjs')`.
Build, dev and analyzer commands copy both the installed worker and its
`maplibre-gl-shared.mjs` sibling into the same versioned public directory.
Docker includes this directory; Turbo caches it alongside build output.
No CDN worker, dependency upgrade or CSP relaxation is involved.

Next.js emits `new URL(..., import.meta.url)` workers as raw assets without
their shared sibling, leaving the worker unable to import its dependency and
the basemap blank despite loaded style metadata and DOM markers. Copying both
files follows the [official Next.js worker guidance](https://github.com/maplibre/maplibre-gl-js/blob/main/docs/index.md#installation).
The existing `next build --webpack` path remains authoritative. Both worker
modules are same-origin and use the unchanged `worker-src 'self' blob:` policy.

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

## Stage 16 route lines

Saved route LineStrings render on the existing map as a GeoJSON Source with line
layers: dotted walking, dashed cycling, and solid driving. No vertex DOM markers
or second map are created. Selected route/card state is shared locally; selecting
a route fits bounds derived from persisted geometry. Ordinary query refetch does
not force camera changes. Route attribution remains visible whenever geometry is
rendered. See [Routing](routing.md).

## Post-v1 hosted worker verification

The production browser regression uses a deterministic MapTiler boundary fixture
with valid vector-tile bytes and the real local MapLibre worker; it does not
qualify live MapTiler responses. After a separately authorized deployment:

1. Confirm worker and shared-module requests return 200 from the web origin.
2. Confirm MapTiler style.json, tiles.json, sprites and actual `*.pbf` requests
   return 200; the basemap must render beneath TripForge markers.
3. Verify zoom/pan, destination and itinerary markers, popup and Show all places.
4. Verify saved route overlays where available and MapTiler place search.
5. Reload and verify persisted locations and the basemap remain visible.

Hosted vector-tile verification remains **PENDING EXTERNAL** until that run.

Local qualification (2026-10-07): lint, typecheck, 621 unit tests, `check`,
`check:full` (98 integration tests), `security:audit`, `release:check`,
`docs:check` and whitespace checks passed. The two targeted Chromium scenarios
passed: real worker/shared-module loading, vector `.pbf` responses, rendered
basemap pixels, markers/popup, zoom/pan, Show all places, reload persistence and
the existing place-search scenario. The production web Docker build and standard
container smoke passed; both worker modules returned 200 with JavaScript MIME
from the running production image. No live deployment or hosted PASS is implied.
