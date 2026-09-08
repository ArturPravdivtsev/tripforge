# Frontend architecture

## Server Components by default

TripForge React components are Server Components by default. Layout, branding,
static navigation, and presentation remain on the server unless they require
browser-only behavior.

```text
Server
AppShell
├── Header
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

## Shared UI boundary

`packages/ui` contains presentation primitives only. It must not import from
`apps/web`, know about TripForge domain concepts, access APIs, or own application
state. Application shell and domain-specific components stay in `apps/web`.
