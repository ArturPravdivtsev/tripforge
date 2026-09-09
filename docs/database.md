# Database foundation

## Architecture

```text
NestJS
   │
   ▼
Drizzle ORM
   │
   ▼
node-postgres Pool
   │
   ▼
PostgreSQL 18
```

`DatabaseModule` owns the connection pool and exports one Drizzle database
token for future services. The pool uses driver defaults, opens connections
lazily, and closes through Nest's application shutdown lifecycle.

Unit and HTTP foundation tests do not require Docker or a running database.
Authentication persistence is additionally verified with an isolated
Testcontainers PostgreSQL instance that applies the committed migrations.

## Current schema

```text
users
  ├── 1 ── 0..1 password_credentials
  ├── 1 ── *    auth_sessions
  └── 1 ── *    trips
```

Both tables use database-generated UUID primary keys. `users.email` is required,
bounded to 320 characters, and protected by the `users_email_unique` constraint.
`display_name` is nullable so persistence does not force a profile name.
`users_email_normalized_check` requires trimmed lowercase email storage, while
`users_email_unique` enforces uniqueness of that canonical value.

`password_credentials.user_id` is a cascading foreign-key primary key, so a
user has at most one current password credential. `auth_sessions` contains only
the SHA-256 hash of each random browser token. Its token hash is unique and
format-checked; its expiry must be later than creation. User and expiry indexes
support future session management and cleanup. Deleting a user cascades to both
authentication tables.

Every trip requires an owner and a bounded, non-blank name. The owner foreign
key uses `ON DELETE RESTRICT`, preventing accidental trip deletion with a user.
`trips_owner_id_idx` supports future owner-based lookups. Calendar dates use the
PostgreSQL `date` type, and `trips_date_range_check` rejects an end date before
the start date when both values exist.

`created_at` and `updated_at` are timezone-aware timestamps with creation
defaults. No automatic `updated_at` mechanism exists yet; future write logic
must update it explicitly.

## Migration workflow

```text
edit TypeScript schema
          │
          ▼
  pnpm db:generate
          │
          ▼
 review generated SQL
          │
          ▼
   pnpm db:migrate
```

Use `pnpm db:check` to verify migration metadata consistency. Do not use
`drizzle-kit push` as the normal schema workflow. Drizzle Kit records applied
migrations in PostgreSQL, so rerunning `pnpm db:migrate` applies only pending
files.

Native commands use `DATABASE_URL` when provided and otherwise target the local
Docker database at `127.0.0.1:5433`. Compose uses `db:5432` internally.

The authentication migration normalizes pre-existing emails before adding the
database check. If historical addresses collide after normalization, the
existing unique constraint aborts the migration transaction so the conflict can
be resolved without silently deleting either account.

## Docker persistence

PostgreSQL data lives in the `postgres_data` named volume mounted at
`/var/lib/postgresql`, the PostgreSQL 18 data root. Normal
`docker compose down` preserves this volume.

To deliberately reset the local database:

```bash
docker compose down -v
```

**Warning:** this permanently deletes the local TripForge PostgreSQL volume and
all data stored in it. It is not part of normal shutdown.
