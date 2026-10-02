# Worker backlog

Symptoms: incomplete cleanup rows/oldest age rise, worker jobs fail repeatedly,
worker task unavailable. SEV-2 while core persists safely; elevate data/security
impact where delayed cleanup exceeds policy. Do not equate queue length to lost data.

1. Inspect ECS worker state/events and `worker.ready`, `worker.job.failed`,
   `worker.consumer.error`; correlate bounded job-name/outcome/attempt traces.
   Compare PG outbox oldest age/incomplete count, Redis and S3 health/IAM.
2. Worker concurrency is 5, default DB pool 4. Retry is eight attempts with 5s
   exponential delay. Dispatcher cadence is 30s; don't diagnose every 30s pause
   as a consumer outage. Failed rows remain explicit responsibility.
3. Restore failed dependency or compatible worker revision first. Restart with
   operator permission; SIGTERM closes active BullMQ work. Do not flush Redis,
   delete outbox rows, mark failed jobs completed or launch unbounded workers.
4. Redis queue loss can be rebuilt from durable dispatchable outbox. Deterministic
   job IDs dedupe dispatch; completed-row noops and idempotent object deletion
   make repeats safe. Inspect terminal failed rows individually before retrying;
   no bulk “retry everything” instruction is authorized here.

Local evidence: 120 rows survived downtime/FLUSHDB; final drain 31.211s including
scheduler delay, ~3.84/s recovery throughput, failed zero. Active-job shutdown
completed without SIGKILL; duplicate delivery nooped. These are not S3/cloud
throughput limits. Scale only after measuring oldest-age slope and dependency/
pool capacity; worker CPU autoscaling remains intentionally disabled.

Recovery: oldest age and count fall, no unexplained failed rows, cleanup effects
confirmed on approved disposable files, other core endpoints remain healthy.
Escalate sustained failures or privacy-retention breach; record backlog size/age,
drain throughput, retries, actual mitigation and owner of terminal failures.
