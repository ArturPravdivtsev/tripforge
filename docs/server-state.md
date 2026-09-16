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
```

Every list-changing parameter is part of its key. The list prefix targets all
paginated lists without clearing unrelated cache entries.

## Cache rules

- Create: invalidate lists; let server ordering and timestamps decide placement.
- Update: set the returned detail immutably, then invalidate lists.
- Delete: cancel and snapshot the visible list, remove the item and update its
  metadata, rollback on failure, then invalidate all lists.
- Logout, login, registration, or guest discovery: cancel and remove all Trip
  queries so data cannot cross user identities.

Only the visible page is optimistically changed. Inactive pages are refreshed
through invalidation rather than reshuffled in browser code.

## Client state vs server state

TanStack Query owns `Trip`, `TripsPage`, loading/error state, freshness, and
mutation lifecycle. React Hook Form owns editable input. Local React state owns
inline delete confirmation and sanitized mutation errors. The current page is
stored in the URL so refresh and browser history preserve navigation.
