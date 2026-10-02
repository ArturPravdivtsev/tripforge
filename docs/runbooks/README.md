# Incident runbooks

SEV-1: core/data/security outage, widespread unauthorized access or corruption.
SEV-2: degraded optional storage/routing/AI/realtime or growing cleanup backlog
with persistent core available. SEV-3: isolated low-impact issue. Elevate when
scope/customer impact changes. One incident owner coordinates mitigation,
operator permissions, updates and recovery; no heavy incident bureaucracy.

First capture UTC timestamp, environment/account/region, revision/digests,
symptoms, aggregate metrics and safe request/trace IDs. Never capture cookies,
passwords, SQL values, prompts, presigned URLs or private resource contents.
All cloud drill commands require explicit approved **disposable** identifiers;
runbooks do not grant production mutation authority. Prefer read-only diagnosis
and known-good application rollback. Never prune volumes, flush production Redis,
truncate tables, delete source backups or restore over a source database.

| Runbook | Main signals |
| --- | --- |
| [API unhealthy](./api-unhealthy.md) | ALB unhealthy targets, 5xx, `/ready` |
| [Database outage](./database-outage.md) | readiness, PG/pool/connection metrics |
| [Redis outage](./redis-outage.md) | realtime publisher, protected-action 503, worker |
| [Worker backlog](./worker-backlog.md) | oldest age, incomplete/failed jobs |
| [S3 failure](./s3-failure.md) | upload/HEAD/download/cleanup failure |
| [Deployment rollback](./deployment-rollback.md) | deployment events, task exit, revision |
| [Database restore](./database-restore.md) | backup window, new-instance restore evidence |
| [AI provider outage](./ai-provider-outage.md) | AI outcomes/duration, safe SSE errors |
| [Routing provider outage](./routing-provider-outage.md) | ORS outcomes/duration, controlled 503 |

Follow [release checklist](../release-checklist.md) after recovery. Record what
was observed vs inferred, actual mitigation, customer impact, timings,
verification, cleanup and follow-up owner. Local results are in
[production readiness](../production-readiness.md); AWS execution is pending.
