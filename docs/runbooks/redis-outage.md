# Redis outage or data loss

Symptoms: `realtime.redis.unavailable`, publisher errors, socket cross-node lag,
worker connection/backlog growth, protected requests returning 503. Initially
SEV-2; elevate if legitimate core actions are broadly unavailable. `/ready`
remains PG-only; 200 does not imply all Redis-dependent features are healthy.

1. Inspect ElastiCache events, TLS/AUTH/secret versions, SG, primary endpoint,
   memory/CPU, connections and evictions. `noeviction` must remain set. Inspect
   worker oldest age and realtime publisher failure signals.
2. Persisted core reads should still work. Rate-limited security actions must
   fail closed, not bypass enforcement. Do not make Redis a readiness dependency
   or turn production limiting off to mask the outage.
3. Restore connectivity/valid credentials; let bounded reconnect retry normally.
   Never run FLUSHDB in a real environment. Local FLUSHDB proof only erased a
   newly owned disposable Redis and demonstrated PG outbox recovery.
4. Queue loss: PG outbox is cleanup responsibility. Restart verified worker/
   dispatcher if needed; deterministic job IDs and completed-row noops avoid
   duplicate destructive work. Inspect failed rows; do not manually mark them done.

## Controlled ElastiCache failover qualification — pending

Only an approved **disposable Multi-AZ replication group**, explicit profile/
region and shard. Verify current account via STS and group/source status first;
validate endpoints, replicas and read-only pre/post core/worker/realtime metrics.

```bash
test "$QUALIFICATION_ACK" = DISPOSABLE_AWS
case "$TEST_REPLICATION_GROUP" in stage31-test-*) ;; *) exit 1;; esac
aws elasticache test-failover --profile "$AWS_PROFILE" --region "$AWS_REGION" \
  --replication-group-id "$TEST_REPLICATION_GROUP" --node-group-id "$TEST_NODE_GROUP"
```

This causes a failover and is not incident repair. Wait for events and group
availability, then record reconnect/fresh authorization/joins, protected-action
behavior, durable backlog drain and latency. Respect AWS's current operation
limits; see [official TestFailover reference](https://docs.aws.amazon.com/cli/latest/reference/elasticache/test-failover.html).
No real failover is claimed. Redis RPO is not business-data RPO: queue/session-
limiter/stream loss can degrade operations, but business truth/outbox is PG.

Recovery: protected actions no longer 503, cross-node invalidation converges,
sockets freshly reauthenticate/rejoin/refetch, backlog age falls and failed count
is explained. Escalate persistent memory/eviction or failover issues to operator;
record duration, endpoints, events and any data-loss impact without AUTH secrets.
