# Frontend architecture

## Server Components by default

TripForge React components are Server Components by default. Layout, branding,
static navigation, and presentation remain on the server unless they require
browser-only behavior.

```text
Server
RootLayout
└── QueryProvider [Client]
    └── AppShell
        ├── Header
        │   ├── AuthStatus [Client]
        │   └── MobileNavigation [Client]
        ├── Sidebar
        └── Page
```

## Client Components

Client Components are small interactive or browser-dependent leaves. The mobile
navigation owns only its open state, keyboard handling, and focus behavior; it
does not force the surrounding shell into the client bundle.

This server-first approach sends less client JavaScript, keeps data boundaries
clear, and matches the Next.js App Router architecture. It is guidance rather
than dogma: a Client Component is appropriate whenever its responsibility
genuinely requires client behavior.

The `/register` and `/login` pages and their shell remain Server Components;
only `RegisterForm` and `LoginForm` are client leaves. They use React Hook Form
and Zod for UX validation, then call a small app-specific auth API boundary.
Backend DTO validation remains authoritative.

The `/trips`, `/trips/new`, and `/trips/[tripId]/edit` route pages also remain
Server Components. Their interactive leaves (`TripsDashboard`, create form,
and edit screen) own browser queries, mutations, and form state. Initial data
is intentionally fetched in the browser; SSR cache hydration is deferred.

The Trip map is a local Client Component island inside `DestinationsSection`.
`TripPage`, the workspace route, and `RootLayout` remain server-first. The
MapLibre implementation is loaded with `next/dynamic` and `ssr: false`, so
browser-only WebGL and worker initialization never execute during SSR and do not
enter routes that never render a map. Map failures are isolated locally.

`RoutesSection` is an application-specific client leaf. It lists persisted route
snapshots, exposes mutations only to owner/editor, and shares only selected-route
identity with the map. Browser route requests go through `tripsApi` to Nest; no
ORS endpoint, profile, or key exists in frontend request code.

`PlaceSearchCombobox` is another application-specific client leaf. It owns
accessible combobox interaction and delegates request construction, Zod response
validation, and provider normalization to `lib/places/maptiler-geocoding.ts`.
It stays in `apps/web`, not `packages/ui`, because it knows MapTiler, Trip Day
destination proximity, and the itinerary place contract.

## Browser API boundary

`lib/api/config.ts` returns an empty origin prefix: browser requests use relative
`/api/...` URLs. The Next.js HTTP route proxies streams to server-runtime
`API_ORIGIN`; `WEB_ORIGIN` validates the web host and forwarding context.
`apiFetch` centralizes JSON decoding, sanitized API errors,
`credentials: include`, and the mutation marker. `authApi` exposes only the four
current operations: register, login, current-user discovery, and logout.

Socket.IO also connects to the web origin; the existing Next.js Proxy rewrites
its `/socket.io` WebSocket upgrade to the upstream `/socket.io/` endpoint. See the
[hosted demo boundary](./hosted-demo.md) for configuration and security details.

`AuthStatus` owns localized loading, guest, authenticated, and recoverable error
state. While authenticated it also mounts the single global realtime owner and
notification bell. The HttpOnly cookie is the sole session source of truth;
there is no auth context, global store, or local/session storage persistence.

`tripsApi` reuses the same boundary for authenticated CRUD. TanStack Query owns
the temporary Trip server-state representation. React Hook Form owns form input,
and component state owns inline delete confirmation and safe error messages.
Successful login, registration, logout, and guest discovery remove Trip and
notification queries so cached data cannot cross authentication identities.

`NotificationsScreen` is a focused client leaf at `/notifications`. It owns the
infinite cursor query and optimistic read/read-all mutations. Presentation copy
and safe internal targets are derived from discriminated shared contracts; raw
payload fields never become arbitrary links.

`TripSearchScreen` is a focused client leaf at `/trips/[tripId]/search`. It owns
only search text and the selected resource filter, debounces requests by 250 ms,
and forwards TanStack Query cancellation through `tripsApi`. Results use closed
typed domain targets mapped to internal routes; response data cannot introduce
an arbitrary URL. Query text is not persisted or URL-synchronized.

`DocumentsScreen` is the client leaf for document metadata and the two-phase
upload state machine. Nest creates a pending row and returns a presigned URL;
`lib/documents/upload-file.ts` performs only the raw S3 PUT with XHR so progress
and cancellation are observable. Cookies and `X-TripForge-Request` are never
sent to S3. AWS SDK packages remain API-only. Temporary progress and signed URLs
are component-local and never enter TanStack Query or persistent browser storage.

`lib/maps/config.ts` is the only reader of `NEXT_PUBLIC_MAPTILER_KEY` and the
only source of the MapTiler style URL. Missing configuration is represented as
an unavailable map and disabled optional place search rather than an application
startup failure. Normal itinerary editing and stored-place rendering continue.
The key is intentionally browser-visible. MapTiler search uses direct browser
`fetch`; provider JSON never enters React components or the Nest server.

## Realtime boundary

The authenticated shell mounts one `AuthenticatedRealtimeBridge`. It owns the
singleton socket connect/disconnect lifecycle, invalidates notifications on the
minimal user-room event, and invalidates them again after reconnect to repair a
gap. `app/trips/[tripId]/layout.tsx` mounts `TripRealtimeBridge` only for active
Trip room join/leave, Trip event validation, and resource-to-query mapping. The
client-only socket module derives its URL from the existing API origin, creates
no connection during SSR, and uses WebSocket-only Socket.IO with credentials.

Reconnect repeats authentication and Trip authorization, then actively
refetches the whole Trip resource set. Delete or access-revoked events remove
the detail subtree and navigate to `/trips`. A compact fixed status/presence
indicator reports `Reconnecting`, `Live`, or `Unavailable` without expanding
Trip headers on narrow screens. Listener registration and cleanup use the same
function references, making both boundaries safe under React Strict Mode.
Logging out unmounts the global owner, disconnects the socket, and prevents
reconnect under the guest identity.

Remote itinerary invalidations are deferred while a drag/reorder operation is
active, then flushed after it settles. Query refetches do not reset unsaved
React Hook Form values. Realtime transports no entity snapshots and exposes no
browser mutation API. See [Realtime collaboration](./realtime.md).

## Shared UI boundary

`packages/ui` contains presentation primitives only. It must not import from
`apps/web`, know about TripForge domain concepts, access APIs, or own application
state. Application shell and domain-specific components stay in `apps/web`.

## Accessibility architecture

Accessibility is part of the primary interface, not a separate mode. Native
HTML is preferred over ARIA, every pointer workflow has keyboard access, and
dragging workflows additionally provide an ordinary click/tap alternative.
Universal focus/target/input behavior belongs in shared primitives and global
tokens; Trip-, route-, expense-, and map-specific names/status stay in
`apps/web`.

The graphical map is supplementary: destination, itinerary, and route lists
remain canonical. Live regions are small and restrained; important failures are
assertive, while settled results, upload/reorder completion, and prolonged
realtime outage/recovery are polite. Route pages expose one main landmark,
meaningful headings/titles, uniquely labelled navigation, and a skip link.
See [Accessibility](./accessibility.md).
