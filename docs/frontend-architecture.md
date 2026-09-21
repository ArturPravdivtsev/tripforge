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

`lib/api/config.ts` is the only reader of `NEXT_PUBLIC_API_URL` and requires an
exact HTTP(S) origin. `apiFetch` centralizes JSON decoding, sanitized API errors,
`credentials: include`, and the mutation marker. `authApi` exposes only the four
current operations: register, login, current-user discovery, and logout.

`AuthStatus` owns localized loading, guest, authenticated, and recoverable error
state. The HttpOnly cookie is the sole session source of truth; there is no auth
context, global store, or local/session storage persistence.

`tripsApi` reuses the same boundary for authenticated CRUD. TanStack Query owns
the temporary Trip server-state representation. React Hook Form owns form input,
and component state owns inline delete confirmation and safe error messages.
Successful login, registration, logout, and guest discovery remove Trip queries
so cached data cannot cross authentication identities.

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

## Shared UI boundary

`packages/ui` contains presentation primitives only. It must not import from
`apps/web`, know about TripForge domain concepts, access APIs, or own application
state. Application shell and domain-specific components stay in `apps/web`.
