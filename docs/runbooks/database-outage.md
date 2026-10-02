# PostgreSQL outage

Symptoms: `/ready` 503, core 5xx, pool errors/waiters, RDS connection/network alarms.
Widespread core failure is SEV-1. Local drill: health stayed 200, ready 503, safe
core 500; process survived and automatically recovered after its owned DB restarted.

1. Confirm environment/account/region; inspect RDS events/status/storage/CPU/
   connections, ALB target state, DB spans and `database.pool.error` categories.
   Check DNS/private SG/TLS and Secrets Manager version/task-start timing.
2. Read-only TLS session as an authorized operator:

   ```bash
   psql "$QUALIFICATION_DATABASE_URL" -X -v ON_ERROR_STOP=1 \
     -c 'SHOW max_connections' -c 'SHOW statement_timeout' \
     -c 'SELECT count(*) FROM pg_stat_activity'
   ```

   Use `sslmode=verify-full`, correct RDS hostname/CA. Do not print the URL or
   collect query values in diagnostics. Actual cloud max_connections is pending.
3. Compare all consumers with `117` default worst-case pool budget. Inspect locks
   and bounded query-plan evidence before resizing. Do not terminate arbitrary
   sessions, disable TLS, restart RDS, or replay mutations blindly.
4. Restore networking/valid role credentials with operator approval. Rotation
   needs new ECS tasks because secret injection occurs at task start. If a bad
   release caused failure, roll back compatible application digests.
5. Suspected data loss/corruption: preserve source/snapshots and use
   [new-instance restore](./database-restore.md), not in-place overwrite.

Recovery: ready 200, no sustained queue, existing session/Trip/RBAC/search/
expenses/doc metadata consistent. Compare error/latency metrics and migration
journal; note any missed operations/reconciliation. Escalate ongoing storage or
data-integrity risk to the DB operator. Record outage, repair and observed RPO/RTO.
