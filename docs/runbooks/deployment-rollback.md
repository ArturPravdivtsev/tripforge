# Deployment rollback

Symptoms: deployment task exits, unhealthy targets, rising failures after a
revision, deployment circuit breaker failure. SEV-1 if core is unavailable;
SEV-2 if contained to an optional capability. Stop further promotions first.

1. Confirm exact environment/account/region and release revision/digests. Inspect
   ECS service deployments/events/task exit categories, ALB readiness, PG migration
   journal and safe request traces. Distinguish migration failure from app failure.
2. Migration task must finish exit 0 **before** service updates. Local test executes
   the actual workflow shell with fake AWS: exit 42 produces zero update-service
   calls; exit 0 updates API/worker/web. This is not a real ECS failure drill.
3. Application rollback: dispatch `deploy-aws.yml` with the prior verified source
   revision and complete web/API/migrate immutable digest set, only after checking
   old application/schema compatibility and public web build origins. The
   production Environment/concurrency/OIDC controls remain unchanged. Never
   deploy mutable `latest` or rebuild/relabel previous bytes.
4. Rollback does not undo schema or committed data. Prefer an additive forward
   repair if old binaries cannot consume the current schema. For data corruption,
   preserve source and follow [restore](./database-restore.md), not “down migration”.

## Dedicated bad-revision drill — pending AWS

Use a separately approved disposable cluster/service with a known **COMPLETED**
baseline revision, matching DB schema and circuit-breaker rollback enabled.
Record account and source; require a `stage31-test-*` service and explicit bad
task revision. No production health failure, fake route or image rebuild is needed.

```bash
test "$QUALIFICATION_ACK" = DISPOSABLE_AWS
case "$TEST_ECS_SERVICE" in stage31-test-*) ;; *) exit 1;; esac
aws ecs describe-services --profile "$AWS_PROFILE" --region "$AWS_REGION" \
  --cluster "$TEST_ECS_CLUSTER" --services "$TEST_ECS_SERVICE"
aws ecs update-service --profile "$AWS_PROFILE" --region "$AWS_REGION" \
  --cluster "$TEST_ECS_CLUSTER" --service "$TEST_ECS_SERVICE" \
  --task-definition "$TEST_BAD_REVISION"
```

The bad revision is operator-reviewed and cannot reach users. Observe deployment
events/FAILED state and return to the previous COMPLETED revision. Circuit-breaker
rollback requires a completed predecessor; inspect actual events rather than
assuming a waiter proves rollback. See [AWS circuit-breaker semantics](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/deployment-circuit-breaker.html).
Then verify healthy targets, core/disposable smoke, worker backlog and fresh
socket auth/join/refetch. Remove only the dedicated test resources after evidence
and cost review; keep prior artifact digests for normal rollback.

## Expand / migrate / contract

Expand with backward-compatible nullable/additive fields and compatibility
reads/writes. Migrate/backfill in bounded resumable batches and verify counts,
constraints and old/new binary behavior. Contract only after all old tasks and
rollback windows are gone, with backup/recovery review. No destructive schema
change was added in Stage 31; the committed journal still contains 15 migrations.

`pnpm migrations:safety` conservatively detects DROP/TRUNCATE/DELETE, type changes,
new NOT NULL and renames. An exception in `migration-approvals.json` requires
exact file SHA-256, meaningful reason, compatibility, recovery and reviewer.
This review gate is not a full SQL parser or proof of data safety; PR human
review and actual upgrade testing remain required.

Recovery: compatible known-good revisions, targets/core/worker/realtime healthy,
no unexplained migration or data drift. Escalate schema incompatibility or failed
rollback to release/DB operator. Record failed/successful revisions, task exit,
events/timeline and recovery checks; never hide cleanup or migration failure.
