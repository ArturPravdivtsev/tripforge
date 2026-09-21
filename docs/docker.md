# Docker runtime

Docker provides a reproducible, production-like local runtime for TripForge.
Normal source development should continue to use `pnpm dev`.

## Concepts

- **Dockerfile:** recipe that builds either the TripForge web or API image.
- **Image:** immutable application artifact containing Node.js and the production
  build required by one TripForge service.
- **Container:** running instance of an image; TripForge runs one Node.js process
  per container.
- **Compose service:** declarative configuration for `web`, `db`, `migrate`, `api`, or `localstack`,
  container, including its build, ports, environment, and healthcheck.
- **Build context:** repository root sent to Docker so workspace metadata and
  packages are available during each build.
- **Volume:** persistent container storage. `postgres_data` keeps PostgreSQL 18
  data and `localstack_data` keeps private document objects across normal
  container replacement.
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
 │                                      NestJS :4000 ───► localstack:4566
 │                                          ▲
 │                                          │ migration completed
 │                                          │
 └── 127.0.0.1:5433 ─► db container ─► migrate container
                         PostgreSQL 18       one-shot
                         :5432

     127.0.0.1:4566 ─► LocalStack S3 :4566
```

Services share the default Compose network. Database clients use `db:5432`
inside it; the API uses `localstack:4566` for storage operations. The browser
receives signatures for host-visible `localhost:4566`. Host-only mappings are
`127.0.0.1:5433` for PostgreSQL and `127.0.0.1:4566` for LocalStack.

## Commands

Build and start the production-like runtime:

```bash
export LOCALSTACK_AUTH_TOKEN=<your-localstack-token>
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
docker compose logs localstack
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
- LocalStack S3: <http://127.0.0.1:4566>

The web image compiles `NEXT_PUBLIC_API_URL=http://127.0.0.1:4000` into the
browser bundle. Compose configures the API with
`WEB_ORIGIN=http://127.0.0.1:3100`, matching the host-visible web origin rather
than the internal container hostname. These two values must remain aligned with
the URLs the browser actually uses.

`OPENROUTESERVICE_API_KEY` is passed only to the API runtime service. It is not
a web build argument or `NEXT_PUBLIC_*` value. Missing routing credentials do
not fail the API healthcheck; saved route reads remain available while explicit
route calculations return a controlled unavailable response.

The API image includes the trusted native install step for `argon2@0.45.1` and
runs password hashing and verification on `node:24-bookworm-slim`. The existing
large migration image remains known optimization debt; authentication does not
change its purpose or lifecycle.

Compose pins LocalStack to `2026.08.3`, creates the private
`tripforge-documents` bucket through `docker/localstack/init/ready.d`, and sets
CORS for the exact web origin. The API uses separate internal and public
endpoints so presigned browser URLs never contain the Compose-only hostname.
Calendar-versioned LocalStack images require `LOCALSTACK_AUTH_TOKEN`; keep it in
the shell or an uncommitted Compose `.env`, and use a distinct CI token in CI.
The token is passed only to LocalStack and must never enter source control.
It is also required to exercise LocalStack snapshot persistence across restarts;
the service is configured with `PERSISTENCE=1` and a named Docker volume.
Local credentials are intentionally non-secret test values. Production omits
custom endpoints and static credentials so the AWS SDK can use its normal IAM
credential chain; the bucket must remain private and grant only the API's
required object actions. `docker compose down` preserves both named volumes;
`docker compose down -v` deliberately removes database and object data.

Override host ports only when necessary:

```bash
TRIPFORGE_WEB_PORT=3200 TRIPFORGE_API_PORT=4100 docker compose up -d
```
