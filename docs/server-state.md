# Server state

## Why TanStack Query

Trip lists and details are remote state: PostgreSQL is durable truth, while the
browser holds a temporary representation. TanStack Query manages request
lifecycle, caching, modest freshness, mutation lifecycle, invalidation, and the
optimistic delete rollback. It does not own form values, confirmation state, or
navigation state.

One `QueryClient` lives in `QueryProvider` below the server `RootLayout` and is
shared by authentication UI and all Trip client leaves. Queries are fresh for
30 seconds. Deterministic 4xx responses are not retried; network and 5xx
failures receive at most one retry.

## Query keys

```text
["trips"]
["trips", "list"]
["trips", "list", { page, pageSize }]
["trips", "detail"]
["trips", "detail", tripId]
["trips", "detail", tripId, "members"]
["trips", "detail", tripId, "destinations"]
["trips", "detail", tripId, "days"]
["trips", "detail", tripId, "itinerary"]
["trips", "detail", tripId, "routes"]
["trips", "detail", tripId, "reservations"]
["trips", "detail", tripId, "reservations", reservationId]
["place-search", "maptiler", { query, proximity }]
```

Every list-changing parameter is part of its key. The list prefix targets all
paginated lists without clearing unrelated cache entries.

## Cache rules

- Create: invalidate lists; let server ordering and timestamps decide placement.
- Update: set the returned detail immutably, then invalidate lists.
- Delete: cancel and snapshot the visible list, remove the item and update its
  metadata, rollback on failure, then invalidate all lists.
- Add/change/remove member: perform the server mutation, then invalidate only the
  affected Trip's members key. No optimistic add is used because canonical user
  ID, display name, and email come from the server.
- Destination create/rename: invalidate destinations. A coordinate PATCH
  replaces only the returned destination in the exact destinations cache;
  reorder replaces that exact cache entry with the authoritative normalized
  list. Delete invalidates destinations and Days because assignments may have
  been cleared.
- Day assignment: replace the returned Day in the exact Days cache. Trip date
  edits update detail, invalidate lists, Days, and itinerary so reconciliation is
  visible on the workspace.
- Itinerary create/update/delete invalidates the exact itinerary key. Reorder
  cancels the query, snapshots the complete item array, writes normalized Day IDs
  and positions optimistically, restores the full snapshot on error, and always
  invalidates after settlement. No request is sent during drag-over.
- Route create appends the returned snapshot to the exact routes cache;
  recalculate replaces that entry; delete removes it. An itinerary place update
  or item delete invalidates both itinerary and routes because coordinate changes
  can delete route rows server-side. Reorder leaves the routes cache intact.
- Reservation create invalidates only the exact reservation list. Update sets
  the returned detail, invalidates only the exact list, then navigates back.
  Delete removes the detail and invalidates the exact list. Server ordering is
  authoritative, so these mutations are not optimistic. Reservation mutations
  never invalidate routes, itinerary, Days, or unrelated Trip caches.
- Logout, login, registration, or guest discovery: cancel and remove all Trip
  queries so data cannot cross user identities.
- MapTiler autocomplete uses a separate public external-state tree, a 60-second
  stale time, five-minute garbage collection, and no persistent storage. Its
  query function forwards TanStack Query's `AbortSignal` to `fetch`, so obsolete
  queries can be canceled. It is intentionally not nested below `['trips']`.

Only the visible page is optimistically changed. Inactive pages are refreshed
through invalidation rather than reshuffled in browser code.

## Client state vs server state

TanStack Query owns `Trip`, `TripsPage`, `TripParticipant[]`,
`TripDestination[]`, `TripDay[]`, `ItineraryItem[]`, loading/error state, freshness, and mutation
lifecycle. Membership and effective access are server
state: they can change in another session and must not become durable React state
or session claims. React Hook Form owns editable input. Local React state owns
inline confirmations, transient sortable groups, and sanitized mutation errors. Query data
does not overwrite those groups during an active drag. The current page is stored
in the URL so refresh and browser history preserve navigation.

Destination coordinates are durable server state. Map camera position, selected
marker, active location-pick destination, and preview point are local React
interaction state. They are deliberately absent from TanStack Query and
PostgreSQL until the user explicitly saves a coordinate pair.

Place search text, highlighted option, and dropdown visibility are local
interaction state. Provider results are temporary external server state.
Only an explicitly selected, normalized `ItineraryPlace` becomes TripForge
server state after the item mutation succeeds. Public search cache need not be
cleared for security at logout and is allowed to expire in memory naturally.

`TripRouteSegment[]` is TripForge server state. The ORS request in progress is
external-operation/mutation state. Selected route and map camera are local React
state; neither belongs in TanStack Query or PostgreSQL.

`TripReservation[]` and reservation detail are server state. Form values and
delete/cancellation confirmations are local state. Root `['trips']` removal on
authentication transitions clears both reservation list and detail keys.
