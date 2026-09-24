# Background jobs

TripForge uses a dedicated Nest application context for durable maintenance
work. The worker does not open an HTTP port. The HTTP API now has a separate,
best-effort Socket.IO Redis Streams connection for realtime only; it never
shares the BullMQ queue/worker clients.

```text
PostgreSQL storage_cleanup_outbox
                 ↓ bounded dispatcher
BullMQ tripforge-maintenance
                 ↓ Redis AOF
dedicated worker (concurrency 5)
                 ↓
private S3-compatible storage
```

## Transactional outbox

Deleting PostgreSQL metadata and publishing directly to Redis is an unsafe
dual write: the database can commit while Redis is unavailable. Document and
Trip deletion instead insert cleanup intent and mutate business state in the
same PostgreSQL transaction. HTTP can return after that commit; physical object
deletion is eventually consistent.

Each `storage_cleanup_outbox` row has a UUID, an authoritative unique storage
key, an enum reason (`document_delete`, `trip_delete`, or `stale_pending`),
timestamps for creation/dispatch/completion/final failure, and an index for the
ordered incomplete scan. Completed rows are retained as operational history.
If Redis data is lost, the dispatcher recreates jobs from incomplete rows.

## Queue and processors

The stable queue is `tripforge-maintenance`. It uses these explicit job names:

- `storage.dispatch-cleanup-outbox` scans at most 100 outstanding outbox rows;
- `documents.cleanup-stale-pending` transactionally removes at most 100 pending
  documents older than one hour with `FOR UPDATE SKIP LOCKED`;
- `storage.cleanup-object` loads one outbox row, deletes its object, and marks
  the row complete.

Cleanup payloads contain only `{ outboxId }`, validated at runtime. Storage keys
remain authoritative in PostgreSQL and never enter Redis payloads. Cleanup job
IDs are deterministic `storage-cleanup-{outboxId}` values without colons. This
suppresses a duplicate while the BullMQ record exists, but permanent
idempotency comes from completed outbox state and idempotent S3 `DeleteObject`.

Delivery is at least once, not exactly once. In particular, S3 deletion may
succeed before the completion update fails. A retry safely deletes the already
absent object and then records completion.

## Scheduling, retries, and failure states

BullMQ v6 Job Schedulers are upserted with stable IDs:

- `storage-outbox-dispatcher`: every 30 seconds;
- `stale-document-cleaner`: every hour.

TripForge intentionally uses `upsertJobScheduler`; it does not use legacy
repeat options, repeatable-job APIs, or `QueueScheduler`.

Object cleanup receives 8 attempts with exponential backoff starting at 5
seconds. Completed jobs retain up to 1,000 records/7 days and failed jobs up to
5,000 records/30 days; BullMQ applies age cleanup lazily. Retry exhaustion
leaves the outbox incomplete, records `failed_at`, and retains the failed job
for investigation. The dispatcher excludes final failures so it cannot create
an infinite retry loop.

## Concurrency and lifecycle

Upload initialization takes a `FOR KEY SHARE` lock on its parent Trip before
inserting pending metadata. Trip deletion takes `FOR UPDATE`, captures every
document key, writes outbox rows, and deletes the Trip. These lock modes prevent
a new upload row from appearing after deletion has captured its keys.

Stale cleanup locks eligible documents with `FOR UPDATE SKIP LOCKED`. Completion
updates the same row, so completion and cleanup serialize to one valid outcome.
Presigning happens after the upload-init transaction because it is local
cryptographic work and must not lengthen the database transaction.

The worker creates separate queue and worker Redis connections. Worker
connections tolerate reconnects; the queue connection fails bounded producer
operations. `SIGTERM`/`SIGINT` close the BullMQ Worker, Queue, Redis connections,
Nest context, S3 clients, and PostgreSQL pool without calling `process.exit`
early. The CLI worker healthcheck verifies Redis reachability while Docker also
checks that the worker process remains alive.

API `/health` intentionally ignores Redis and worker health. Redis or worker
outage delays cleanup and realtime fan-out but cannot block document or Trip
mutation. A previously
issued presigned download URL may remain valid until its short expiry even after
metadata deletion; asynchronous cleanup is not instant capability revocation.

No sessions, Trip data, authorization, response cache, notifications, or user
job state are stored in Redis. BullMQ is durable work delivery backed by the
PostgreSQL outbox; the Socket.IO Streams adapter is non-durable freshness
transport whose missed messages are repaired by reconnect and refetch.
