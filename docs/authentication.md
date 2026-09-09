# Authentication

## Login model

TripForge is a first-party browser application and uses password authentication
with opaque, server-side sessions:

```text
email + password
      │
      ▼
Argon2id verification
      │
      ▼
random 256-bit session token
      │
      ├──► HttpOnly browser cookie
      │
      └──► SHA-256 ──► auth_sessions.token_hash
```

The raw token exists only in the browser cookie and the incoming request. It is
never returned in JSON, logged, or stored in PostgreSQL. Opaque sessions make
logout, revocation, absolute expiry, and concurrent device sessions direct
database operations. JWT is not inherently unsuitable; its refresh and
revocation lifecycle is unnecessary for the current product topology.

Passwords are not encrypted. They are transformed by the intentionally
expensive Argon2id password KDF with a library-generated random salt. Random
session tokens already have 256 bits of entropy, so fast deterministic SHA-256
is appropriate for indexed lookup without persisting the bearer secret.

## Database model

```text
users
  ├── 1 ── 0..1 password_credentials
  └── 1 ── *    auth_sessions
```

- `users.email` is trimmed and lowercased in the application; PostgreSQL
  enforces the canonical form and the existing unique constraint enforces
  canonical uniqueness.
- `password_credentials.user_id` is both primary key and cascading foreign key,
  allowing at most one password credential per user.
- `auth_sessions` stores a unique, lowercase 64-character SHA-256 hash, a
  cascading user foreign key, and an absolute timezone-aware expiry. Indexes
  support token lookup, future user session management, and expiry cleanup.

Registration writes the user, password credential, and initial session in one
Drizzle/PostgreSQL transaction. A failure at any step rolls back all three
writes, preventing half-created accounts.

## Password policy

Registration accepts passwords from 15 through 128 characters. Spaces,
Unicode, punctuation, and password-manager output are valid. Passwords are
never trimmed, truncated, or subjected to composition rules. Argon2 is
configured explicitly as Argon2id with `memoryCost: 19456`, `timeCost: 2`, and
`parallelism: 1`. The hasher exposes rehash detection so parameters can be
upgraded later without implementing automatic rehashing yet.

Emails are normalized with `trim().toLowerCase()` before persistence and
lookup. Display names are optional, trimmed, non-blank when supplied, and
limited to 100 characters.

## Session lifecycle

```text
register or login
       │ fresh token (never reuse a caller-provided token)
       ▼
create 30-day absolute session
       │
       ▼
guard: cookie -> SHA-256 -> DB lookup -> expiry -> safe current user
       │
       ├── logout ──► delete DB session + clear cookie
       └── expiry ──► reject and opportunistically delete DB session
```

Expiry is absolute and is not refreshed on requests. Every successful login
creates a separate session, so concurrent sessions are allowed. TripForge has
no anonymous pre-authentication sessions; login and registration always create
a fresh random token, preventing session fixation. If anonymous sessions are
added, authentication-time rotation becomes mandatory.

## Cookie environments

Both environments use `HttpOnly`, `SameSite=Lax`, `Path=/`, and a `Max-Age`
matching the 30-day database expiry.

| Environment | Name | Secure | Domain |
| --- | --- | --- | --- |
| development/test | `tripforge_session` | `false` | absent |
| production | `__Host-tripforge_session` | `true` | absent |

The non-prefixed local cookie supports HTTP development. The production cookie
satisfies the `__Host-` requirements and is unavailable to browser JavaScript.
Cookie parsing is unsigned: modification produces an unknown opaque token and
therefore no valid server session.

## HTTP contracts

| Method | Route | Success | Behavior |
| --- | --- | --- | --- |
| `POST` | `/api/auth/register` | `201` | safe user body and new cookie |
| `POST` | `/api/auth/login` | `200` | safe user body and new cookie |
| `GET` | `/api/auth/me` | `200` | guarded safe current user body |
| `POST` | `/api/auth/logout` | `204` | idempotent revocation and cookie clear |

Safe user responses contain only `id`, normalized `email`, and nullable
`displayName`. Duplicate registration returns `409 ACCOUNT_ALREADY_EXISTS`.
Wrong passwords and unknown accounts both return `401 INVALID_CREDENTIALS`; the
unknown-account path still performs Argon2 verification against a valid dummy
hash. Missing, unknown, and expired session tokens all return
`401 UNAUTHENTICATED`.

Browser requests use credentialed Fetch, so the browser accepts and sends the
HttpOnly session cookie without exposing its value to JavaScript. The web app
discovers identity with `GET /api/auth/me` after mounting: `200` becomes the
authenticated header state, while `401` is the normal guest state. Registration
and login redirect home after success, where identity is always rediscovered
from the API rather than fabricated from submitted form values. Logout revokes
the database session, clears the cookie, and transitions the header to guest.

All credentialed browser mutations require both the exact configured `Origin`
and `X-TripForge-Request: 1`. Register and login additionally require an
`application/json` media type. The API client adds the mutation header centrally
and always uses `credentials: include`; frontend code never reads `document.cookie`
or persists auth state in browser storage.

## Deferred capabilities

Email verification,
password reset/change, MFA, OAuth, session-management UI, logout-all-devices,
remember-me variants, refresh tokens, JWT, API keys, and distributed rate
limiting are not implemented. Rate limiting is required before public
production exposure.
