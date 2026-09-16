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

## Shared UI boundary

`packages/ui` contains presentation primitives only. It must not import from
`apps/web`, know about TripForge domain concepts, access APIs, or own application
state. Application shell and domain-specific components stay in `apps/web`.
