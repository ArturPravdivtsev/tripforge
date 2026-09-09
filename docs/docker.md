# Docker runtime

Docker provides a reproducible, production-like local runtime for TripForge.
Normal source development should continue to use `pnpm dev`.

## Concepts

- **Dockerfile:** recipe that builds either the TripForge web or API image.
- **Image:** immutable application artifact containing Node.js and the production
  build required by one TripForge service.
- **Container:** running instance of an image; TripForge runs one Node.js process
  per container.
- **Compose service:** declarative configuration for `web`, `db`, `migrate`, or `api`,
  container, including its build, ports, environment, and healthcheck.
- **Build context:** repository root sent to Docker so workspace metadata and
  packages are available during each build.
- **Volume:** persistent container storage. `postgres_data` keeps PostgreSQL 18
  data across normal container replacement.
- **Network:** Compose's default project network. It is available to both
  services. Web stays independent; API startup follows database readiness and
  successful migration completion.
- **Healthcheck:** in-container HTTP readiness probe using Node.js `fetch`.

## Architecture

```text
Host
 │
 ├── 127.0.0.1:3100
 │       │
 │       ▼
 │   web container
 │     Next.js
 │     :3000
 │
 ├── 127.0.0.1:4000 ───────────────► api container
 │                                      NestJS :4000
 │                                          ▲
 │                                          │ migration completed
 │                                          │
 └── 127.0.0.1:5433 ─► db container ─► migrate container
                         PostgreSQL 18       one-shot
                         :5432
```

Services share the default Compose network. Database clients use `db:5432`
inside it; the host-only PostgreSQL mapping is `127.0.0.1:5433`.

## Commands

Build and start the production-like runtime:

```bash
docker compose build
docker compose up -d
```

Inspect status and logs:

```bash
docker compose ps
docker compose logs -f
docker compose logs web
docker compose logs api
docker compose logs db
docker compose logs migrate
docker compose exec web id
docker compose exec api id
```

Stop and remove the project containers and network without deleting images:

```bash
docker compose down
```

Local endpoints:

- Web: <http://127.0.0.1:3100>
- API health: <http://127.0.0.1:4000/health>
- PostgreSQL: `127.0.0.1:5433`

The API image includes the trusted native install step for `argon2@0.45.1` and
runs password hashing and verification on `node:24-bookworm-slim`. The existing
large migration image remains known optimization debt; authentication does not
change its purpose or lifecycle.

Override host ports only when necessary:

```bash
TRIPFORGE_WEB_PORT=3200 TRIPFORGE_API_PORT=4100 docker compose up -d
```
