# API unhealthy

Symptoms: ALB unhealthy API targets, unexpected 5xx/network failures, failing
`/ready`. SEV-1 if widespread core access fails; CPU alarm alone is not SEV-1.

1. Confirm exact environment and latest deployment; inspect ALB target health,
   ECS service events/running counts/task exits, API 5xx and p95/p99, pool waiters,
   RDS status/connections and safe correlated logs/traces.
2. Compare `/health` with `/ready` using explicit origins:

   ```bash
   pnpm smoke:operational --api="$QUALIFICATION_API_ORIGIN" --web="$QUALIFICATION_WEB_ORIGIN"
   ```

   Health 200 + ready 503 suggests the bounded PG path. Health failing suggests
   process/network/task startup. Redis/S3/Collector/ORS/OpenAI must not gate ready.
3. Check private SG/subnets/TLS/secret reference and rotation timing, not raw
   secret contents. Check pool saturation and slow spans before increasing pools.
4. If regression follows deploy, use [application rollback](./deployment-rollback.md)
   with prior immutable digests and schema compatibility review. If PG fails,
   use [database outage](./database-outage.md). Do not blindly restart all replicas
   or raise task count beyond the verified connection budget.
5. Escalate persistent target/PG failures to the infrastructure operator. Keep a
   healthy replica serving where possible; communicate impact/error-budget burn.

Recovery: healthy ALB targets, ready 200, stable authenticated core reads/writes
through disposable smoke, 5xx/pool/latency recover, cross-node sockets rejoin and
refetch. Record old/new revisions, UTC timeline, cause and recovery evidence.
