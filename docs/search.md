# Trip-wide search

Trip search is a permission-scoped PostgreSQL read model over the existing
domain tables. It has no duplicate search table, external search service,
vector database, embedding pipeline, or AI dependency.

## Searchable resources and fields

| Result type | Searchable fields |
| --- | --- |
| destination | name |
| itinerary | title, notes, place name, place address |
| reservation | title, provider, location, notes, transport operator/service/origin/destination |
| expense | title, notes |
| document | title and original filename, only when `status = ready` |

Confirmation codes, expense amounts/currencies/payers/shares/balances, document
storage keys/ETags/upload metadata, and file contents are deliberately excluded.

## PostgreSQL design

Each searchable source table owns a stored generated `tsvector` built with the
`simple` configuration. Weights are `A` for primary identity, `B` for contextual
identity, and `D` for notes. GIN indexes cover every vector. `pg_trgm` GIN
indexes cover high-signal names/titles/place names/service numbers/filenames;
document indexes are partial over ready rows.

The repository executes one parameterized query. Five trip-scoped branches are
combined with `UNION ALL`, scored, ordered by `relevance DESC, type ASC, id ASC`,
and limited globally. Matching combines `websearch_to_tsquery('simple', q)`,
indexed trigram operators, and a low-threshold similarity fallback after the
selective parent-Trip predicate. Ranking favors exact identity, then prefix and
high similarity, then weighted full-text rank; note-only matches remain useful
but lower. Public results are mapped explicitly into a discriminated contract.

`EXPLAIN` verification with sequential scans disabled confirms the destination
trigram index is usable. On tiny per-Trip fixtures PostgreSQL prefers the
existing `(trip_id, position, id)` index and applies the search predicate to the
small scoped row set, which is the expected plan. Revisit thresholds and plans
with production-like row counts before changing index coverage.

## HTTP and authorization

`GET /api/trips/:tripId/search?q=&types=&limit=` requires the existing session
and current owner/editor/viewer read access. An unrelated user receives the same
`404 TRIP_NOT_FOUND` as a missing Trip. `q` is trimmed and must contain 2–100
characters; invalid input returns `400 INVALID_SEARCH_QUERY`. `types` is an
optional comma-separated subset of `destination,itinerary,reservation,expense,document`;
duplicates are removed and unknown values are rejected. `limit` defaults to 20
and is capped at 50. There is no total count or pagination in this stage.

The response contains the normalized query and relevance-ordered results with
`type`, `id`, `title`, `subtitle`, contextual data, and a closed typed target.
The backend never accepts or returns arbitrary result URLs.

## Browser behavior

`/trips/:tripId/search` is a client leaf under the existing server route and
realtime Trip layout. Its labeled native search input uses a 250 ms debounce.
TanStack Query owns request lifecycle and forwards its `AbortSignal`; the query
key includes Trip, normalized query, filter, and limit. Queries shorter than two
characters stay local. Filters select all resources or one result type. Results
remain one relevance-ordered accessible list with polite live status updates.
Search state is intentionally not synchronized into the URL and result text is
not highlighted in this stage.

Realtime invalidations for destinations, itinerary, reservations, expenses, or
documents also invalidate the Trip search subtree. Route, Day, member, and Trip
metadata events do not. During local itinerary drag, the existing itinerary
deferral also delays its search refresh until the drag settles.

## Verification and deferred scope

The real-PostgreSQL integration suite checks extension/index catalogs, generated
vector updates, every permitted source field, typo matching, transport details,
pending-document exclusion, forbidden fields, ranking, stable order, filters,
limits, roles, anti-enumeration, cross-Trip isolation, web-search syntax, hostile
text, parameterization, and an index-aware `EXPLAIN`. Component tests cover
debounce, typed targets, filters, status output, query keys, and realtime mapping.

Representative QA confirms exact matching for Latin, accented Latin, and
ideographic names (`Tokyo`, `São Paulo`, `München`, `京都`, `北京`) and useful
results for several modest misspellings (`Sensoi`, `Nozmi`, `Tokio`). This is
observed behavior of `simple` FTS plus trigram similarity, not a claim of
language-aware stemming, transliteration, or normalization.

Deferred: cross-Trip/account search, pagination/counts, saved or recent queries,
URL synchronization, snippets/highlighting, document-content extraction, other
languages/stemming, dedicated search infrastructure, embeddings, and AI search.
