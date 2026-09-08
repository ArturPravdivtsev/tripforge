# Docker runtime

Docker provides a reproducible, production-like local runtime for TripForge.
Normal source development should continue to use `pnpm dev`.

## Concepts

- **Dockerfile:** recipe that builds either the TripForge web or API image.
- **Image:** immutable application artifact containing Node.js and the production
  build required by one TripForge service.
- **Container:** running instance of an image; TripForge runs one Node.js process
  per container.
- **Compose service:** declarative configuration for the `web` or `api`
  container, including its build, ports, environment, and healthcheck.
- **Build context:** repository root sent to Docker so workspace metadata and
  packages are available during each build.
- **Volume:** persistent or mounted container storage. TripForge does not need
  one yet because the current applications have no persistent state.
- **Network:** Compose's default project network. It is available to both
  services, although web and API do not currently depend on each other.
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
 └── 127.0.0.1:4000
         │
         ▼
     api container
       NestJS
       :4000
```

The services share only the default Compose network. PostgreSQL and persistent
storage will be introduced separately in Stage 6.

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

Override host ports only when necessary:

```bash
TRIPFORGE_WEB_PORT=3200 TRIPFORGE_API_PORT=4100 docker compose up -d
```
