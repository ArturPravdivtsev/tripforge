# Place search

## Architecture

```text
User search text
      ↓ (300 ms debounce, minimum 3 characters)
browser PlaceSearchCombobox
      ↓ direct fetch + AbortSignal
MapTiler forward geocoding
      ↓ runtime-validated temporary results
explicit selection
      ↓ normalized ItineraryPlaceInput
Nest shape/range validation
      ↓ one itinerary_items insert/update
PostgreSQL embedded place snapshot
```

There is no Nest geocoding proxy or MapTiler SDK. Requests use
`/geocoding/{encodedQuery}.json` with the public `NEXT_PUBLIC_MAPTILER_KEY`,
`autocomplete=true`, and `limit=6`. If the item's Day has a primary Destination
with coordinates, `proximity=longitude,latitude` biases results toward it.
Otherwise proximity is omitted: TripForge never uses IP location or a hard
bounding box.

The browser validates the consumed GeoJSON subset (`FeatureCollection`,
features, string ID/text/full name, finite `[longitude, latitude]`, and
attribution) with Zod, then exposes only name, address, coordinates, provider,
and provider reference. A provider/network/schema failure is a local
`Could not search places right now` state and cannot break normal item editing.
No raw response, raw search string, categories, search history, or provider
cache is persisted.

## Interaction and state

The visible input uses combobox/listbox/option semantics, active-descendant
tracking, pointer-safe selection, and ArrowDown/ArrowUp/Enter/Escape behavior.
Typing alone never attaches a place. Selection fills only a blank title and
collapses to a summary with Change and Remove controls. Existing snapshots
render without a provider request; a replacement becomes durable only after the
item form is submitted.

Search input, active option, and open state are local UI state. Query results are
short-lived MapTiler server state held only in TanStack Query memory (60-second
freshness, five-minute garbage collection). Selected snapshots become
TripForge server state. The query function consumes TanStack Query's
`AbortSignal`, and the query key includes provider, debounced text, and optional
proximity, preventing stale results from replacing a newer search.

Search attribution is rendered as safe application links for MapTiler and
OpenStreetMap contributors; provider HTML is never injected.

## Persistence boundary

`itinerary_items` stores nullable `place_name`, `place_address`,
`place_latitude`, `place_longitude`, `place_provider`, and
`place_provider_ref`. Checks allow either all-null or a snapshot with essential
name/coordinates/provider, enforce coordinate ranges and the current
`maptiler` provider, and reject non-null blank text. Address and provider
reference are optional.

`providerReference` is provenance/debugging metadata only. MapTiler documents
that feature IDs can change when its database is re-indexed, so it is not a
TripForge primary key, foreign key, uniqueness constraint, or lookup dependency.
TripForge UUIDs remain authoritative.

## Provider terms decision

Reviewed **2026-09-17** against the official
[MapTiler Cloud Terms](https://www.maptiler.com/terms/cloud/),
[General Terms](https://www.maptiler.com/terms/), and
[Geocoding API reference](https://docs.maptiler.com/cloud/api/geocoding/).

Stage 15 uses direct end-user browser requests to `api.maptiler.com`, not a
customer proxy. The Cloud Terms permit export/use of search-service results
outside the service, so TripForge persists only the explicitly selected,
normalized subset needed for the user's itinerary. Complete raw responses are
not saved or redistributed. Search/map attribution remains visible. Terms can
change; this decision and production key restrictions must be re-reviewed
before launch and when provider terms or product usage change.

The public browser key is not a secret. Production controls are MapTiler
allowed-origin restrictions, environment-specific keys, quotas/monitoring, and
rotation. The Nest API treats submitted place data as ordinary user-controlled
input; `provider: maptiler` is not proof of origin and triggers no backend
provider lookup.
