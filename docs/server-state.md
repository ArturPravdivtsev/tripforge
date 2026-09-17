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
- Destination create/update: invalidate destinations. Reorder replaces that
  exact cache entry with the authoritative normalized list. Delete invalidates
  destinations and Days because assignments may have been cleared.
- Day assignment: replace the returned Day in the exact Days cache. Trip date
  edits update detail, invalidate lists, Days, and itinerary so reconciliation is
  visible on the workspace.
- Itinerary create/update/delete invalidates the exact itinerary key. Reorder
  cancels the query, snapshots the complete item array, writes normalized Day IDs
  and positions optimistically, restores the full snapshot on error, and always
  invalidates after settlement. No request is sent during drag-over.
- Logout, login, registration, or guest discovery: cancel and remove all Trip
  queries so data cannot cross user identities.

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
