# AWS production deployment

Stage 29 deploys existing Stage 28 artifacts; AWS never rebuilds TripForge.
Terraform `1.16.4` and AWS provider `6.66.0` define one parameterized production
environment.

## Architecture

```text
Internet
   │
Route53 ── ACM DNS validation
   │
public ALB :80 redirect / :443 TLS
   ├── app host ──> private Web Fargate :3000
   └── api host ──> private API Fargate :4000 + /socket.io
                              │
                  ┌───────────┼───────────┐
                  ▼           ▼           ▼
             RDS PostgreSQL  Redis OSS   private S3
                  ▲           ▲           ▲
                  └──── private Worker ───┘
```

```text
public subnets (2+ AZs):  ALB, NAT gateway(s)
private app subnets:      web, API, worker, one-off migrate tasks
isolated data subnets:    RDS and ElastiCache subnet groups
```

Only ALB has internet ingress. Fargate uses `assign_public_ip=false`. RDS and
Redis are never public. The VPC receives configurable IPv4 space plus AWS IPv6
space for dual-stack public ALB aliases. App subnets reach GHCR, ORS, and AWS
public endpoints through NAT. HA uses NAT per AZ; the single-NAT profile is
explicitly not AZ resilient.

## Edge, TLS, health, and realtime

ACM covers `app_domain` and `api_domain`. When `hosted_zone_id` is supplied,
Terraform manages validation plus A/AAAA aliases. Without a real domain the
configuration can be statically validated, but deployment is not production-
complete: certificate issuance, HTTPS, origins, WSS, and secure cookies remain
untested.

ALB routes hosts without path rewriting. HTTP permanently redirects to HTTPS.
API `/health` and web `/health` must return 200; the web response is only `ok`
and exposes no version or endpoints. The API target uses HTTP/1.1 and a
120-second ALB idle timeout. Socket.IO stays WebSocket-only; Redis Streams
provides cross-node fan-out, so sticky sessions are intentionally disabled.
Clients may reconnect during rolling deployments, reauthenticate, rejoin Trips,
and refetch.

Security-group matrix:

| Target | Ingress |
| --- | --- |
| ALB | TCP 80/443 from IPv4/IPv6 internet; 80 redirects only |
| web | TCP 3000 from ALB SG only |
| API | TCP 4000 from ALB SG only |
| worker/migrate | none |
| RDS | TCP 5432 from API, worker, migrate SGs |
| Redis | TCP 6379 from API and worker SGs |

Application egress uses NAT because GHCR and ORS are public dependencies.
Internal ingress never uses `0.0.0.0/0`.

## ECS workloads and identity

One Fargate cluster runs long-lived web, API, and worker services. Migrations are
one-off tasks, never an ECS service. Defaults are 0.5 vCPU/1 GiB for each
service and 0.25 vCPU/0.5 GiB for migration, all configurable. HA defaults are
2 web, 2 API, 1 worker; cost-optimized counts are 1/1/1. Web/API use bounded CPU
target tracking; worker count remains explicit.

Web, API, and worker use rolling deployments with `100/200` minimum/maximum
percent and circuit-breaker rollback. ALB target deregistration and container
stop timeouts allow HTTP/WebSocket drain, BullMQ close, and telemetry flush.
The worker health command checks Redis. ECS Exec is optional and uses audited
SSM channels; no SSH port or EC2 application fleet exists.

Roles are separated:

```text
execution role -> awslogs + ECS-injected Secrets Manager values + private GHCR pull
web task role  -> no application data permission
API task role  -> GetObject/PutObject only under document bucket trips/*
worker role    -> DeleteObject only under document bucket trips/*
migrate role   -> no S3 permission
deploy role    -> ECS release operations + PassRole for these exact roles
```

ECS task roles never create S3 buckets, databases, caches, or IAM resources.
Some AWS APIs such as ECS registration, EC2 describe, SSM channels, X-Ray, and
CloudWatch metrics do not support resource scoping; their `Resource="*"` use is
limited to exact actions and documented in policy.

## RDS, Redis, and S3

RDS runs PostgreSQL `18.6`, encrypted gp3 storage, private subnets, managed
master password in Secrets Manager, TLS application connections, automated
backups, bounded backup retention, CloudWatch PostgreSQL/upgrade logs, deletion
protection, and a required final snapshot. Major upgrades are never automatic.
The current app uses the managed master account; a dedicated least-privileged DB
role is explicit Stage 31 debt.

Local/test keep `DATABASE_URL`. AWS tasks receive `DATABASE_HOST`, `PORT`,
`NAME`, `USER`, and `PASSWORD` as JSON-key secret references plus
`DATABASE_SSL=true`. Mixed or incomplete modes fail startup. Secret injection
happens only at task start; rotation requires a new ECS deployment/restart.

ElastiCache is node-based Redis OSS `7.1`, cluster mode disabled, encrypted at
rest/in transit, AUTH protected, and configured `maxmemory-policy=noeviction`.
Tasks receive a `rediss://` Secrets Manager value; plaintext Redis is rejected
in production. HA uses one primary and one replica with Multi-AZ automatic
failover. Redis supports BullMQ, rate limiting, and Socket.IO Streams but is not
business truth; PostgreSQL outbox remains cleanup recovery truth.

The document bucket is private, bucket-owner-enforced, Block Public Access,
SSE-S3 encrypted, versioned, TLS-only, and not force-destroyed. Lifecycle only
aborts incomplete multipart uploads. Exact-origin CORS permits required
GET/HEAD/PUT operations. API task-role credentials sign direct browser URLs;
production sets no S3 endpoint or static AWS keys. Product delete semantics
remain DB metadata → outbox → worker → `DeleteObject`; versioning retains AWS
recovery history without changing the product lifecycle.

## Secrets and public build configuration

```text
GitHub OIDC token -> exact AWS deploy-role trust
ECS execution role -> RDS/Redis/ORS/private-GHCR secret injection
ECS task roles -> scoped runtime S3 calls
RDS -> managed master secret
Terraform state -> encrypted but secret-bearing Redis AUTH configuration
```

Private GHCR credentials are externally created JSON `{username,password}` with
read-only package access and referenced by ARN. ORS is also an external secret.
No AWS keys, PAT, DB password, Redis password, or ORS key belongs in Git,
tfvars, task plaintext environment, or `NEXT_PUBLIC_*`.

`NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_S3_UPLOAD_ORIGIN`, and the browser-visible
MapTiler key are Stage 28 build inputs. A web digest is valid only for those
origins. Changing public configuration requires a new build/digest; deployment
must not relabel incompatible bytes.

## Deployment and rollback

```text
verified Stage 28 commit + three OCI digests
        │
manual workflow_dispatch in GitHub production Environment
        │ OIDC (no static AWS keys)
        ▼
verify sha256 syntax, main ancestry, OCI revision label
        ▼
register and run private migrate task
        ├── non-zero: STOP; services untouched
        └── zero
             ▼
register API / worker / web task revisions
             ▼
update services + circuit breaker + wait steady state
             ▼
HTTPS health smoke
```

The workflow uses one production concurrency group and cannot auto-deploy PRs
or every main push. Images are always `name@sha256:<64 hex>`; `main` and
`latest` are rejected as authoritative inputs. The worker uses the API digest
with `node dist/worker.js`. Migration runs inside private app subnets with only
RDS access and CloudWatch logs.

Configure these GitHub `production` Environment variables from Terraform
outputs: `AWS_REGION`, `AWS_DEPLOY_ROLE_ARN`, `ECS_CLUSTER`,
`ECS_WEB_SERVICE`, `ECS_API_SERVICE`, `ECS_WORKER_SERVICE`,
`ECS_MIGRATE_TASK_FAMILY`, comma-separated `ECS_MIGRATE_SUBNETS`,
`ECS_MIGRATE_SECURITY_GROUP`, `TRIPFORGE_APP_URL`, and
`TRIPFORGE_API_URL`. Protect the environment with reviewers when supported.

Rollback means dispatching the same workflow with the previous known-good
three-digest set. It creates new ECS revisions from old immutable images. It
does not reverse a database migration. Every schema change used with rolling
deployments must remain backward compatible across old/new tasks; use
expand/contract discipline before destructive changes.

## Logs, telemetry, alarms, and cost

JSON stdout/stderr flows to separate bounded-retention CloudWatch groups for
web, API, worker, migrate, and optional ADOT. Enhanced Container Insights is
configurable. When enabled, an immutable ADOT sidecar receives OTLP only on
`127.0.0.1` and exports traces to X-Ray and metrics to CloudWatch/EMF. Exporter
failure remains fail-open for business operations. Local Prometheus, Jaeger,
and Grafana are not deployed to AWS.

Alarms cover ALB 5xx, unhealthy API targets, ECS CPU/memory, RDS CPU/storage/
connections, Redis CPU/memory, and any eviction. Optional SNS email requires
explicit input. AWS Budget exists only when an operator supplies a monthly USD
limit and contact. Cost switches and profiles are documented in
[`infra/README.md`](../infra/README.md).

## Production QA checklist

After an intentional apply/deploy, verify:

1. ACM `ISSUED`, ALB active, HTTP→HTTPS, valid app/API TLS, healthy targets,
   worker running, RDS/Redis available, S3 private.
2. Register/login/me/logout and the exact Secure, HttpOnly, SameSite=Lax,
   Path=/, no-Domain `__Host-tripforge_session` cookie.
3. The 14 migration hashes occur once, `pg_trgm` exists, search ranking works,
   and RDS connections use TLS.
4. ElastiCache TLS/AUTH supports BullMQ, Streams, and shared rate limits. With
   two API replicas, a mutation through one node reaches a client on another.
5. S3 init → direct PUT → complete → byte-equal download → delete → worker
   cleanup using a clearly disposable Trip/account.
6. CloudWatch JSON logs, X-Ray/OTel traces, metrics, and Container Insights
   appear without passwords, tokens, credentials, presigned URLs, filenames,
   storage keys, or search text.
7. Inspect effective IAM, task-definition secret references, deployment failure
   rollback, safe migration-failure stop, previous-digest rollback, and a
   post-apply no-change drift plan.

Controlled Redis failover, RDS restore, destructive deployment tests, load/
soak/chaos, SLOs, WAF, CDN, RDS Proxy, autoscaling tuning, and blue/green/canary
decisions belong to Stage 31. No cloud QA is claimed until real credentials,
region, domains, and an intentionally approved apply are available.
