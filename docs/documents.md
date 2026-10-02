# Documents and object storage

Trip documents are private Trip resources. PostgreSQL stores metadata,
authorization scope, links, and lifecycle state; S3-compatible object storage
stores binary bytes. A row does not prove that bytes exist, and an object does
not become a valid TripForge document until HEAD verification moves its row from
`pending` to `ready`.

## Upload lifecycle

```text
Create pending metadata
        ↓
10-minute presigned PUT capability
        ↓
Browser uploads bytes directly to S3 with XHR
        ↓
Nest HEAD verifies Content-Length and Content-Type
        ↓
ready
```

Nest never proxies normal file contents and the browser never receives AWS
credentials. Presigned URLs are temporary bearer capabilities: they are not
persisted, logged, added to analytics, or cached as server state. Upload signing
uses the declared Content-Type. Download capabilities expire after five minutes
and are generated only after an authorized click.

The browser uses XHR only for the direct PUT boundary because it exposes real
upload progress and cancellation. Normal TripForge APIs continue to use Fetch,
cookies, exact Origin, JSON, and `X-TripForge-Request`.

## Validation and identity

Allowed types are PDF, JPEG, PNG, and WebP. SVG and other active/executable
formats are excluded. Size must be `1..25 * 1024 * 1024` bytes. MIME allowlisting
is not antivirus scanning.

Original filenames are bounded display metadata. Path components and control
characters are removed. Storage identity is an opaque key:

```text
trips/{tripId}/documents/{documentId}/{randomUUID}
```

The user filename therefore cannot traverse paths, collide, or overwrite an
existing object. It is also sanitized before use in download
`Content-Disposition`.

## Links and history

A document belongs to one Trip independently of optional links. It may link to
at most one itinerary item, reservation, or expense. Application logic verifies
that the target belongs to the same Trip; PostgreSQL enforces link exclusivity.
Target deletion uses `ON DELETE SET NULL`, so the document survives as Trip-level
metadata. Uploader information also remains historical after membership removal.

Owner/editor can upload, finalize, edit metadata, and delete. Viewer can list
and download ready documents. Pending rows are excluded from the normal list.

## Distributed deletion

PostgreSQL and S3 cannot share a normal ACID transaction. Document deletion is
DB-first and durable: one transaction writes `storage_cleanup_outbox` and
removes metadata. HTTP then returns without waiting for S3. A BullMQ worker
loads the authoritative key from PostgreSQL, performs idempotent `DeleteObject`,
and marks the intent complete. Redis or worker failure cannot lose the intent.

Once metadata is gone TripForge cannot issue a new download URL, even while the
private object awaits cleanup. A presigned URL issued earlier remains a bearer
capability until its short expiry. Trip deletion captures every document key
before its cascade. Pending rows older than one hour are locked, revalidated,
and moved into the same cleanup path in bounded batches. See
[Background jobs](./background-jobs.md).

## Local and production storage

Compose runs `localstack/localstack:2026.08.3` with only S3 enabled and a named
volume. An idempotent READY hook creates the private `tripforge-documents`
bucket, blocks public access, and allows PUT CORS only from
`http://127.0.0.1:3100`.

Current LocalStack calendar-versioned images require `LOCALSTACK_AUTH_TOKEN`.
Provide it from the shell or an uncommitted Compose `.env`; CI uses a dedicated
CI token. It is a LocalStack license credential, not an AWS credential, and is
never passed to the API or browser.

Docker-backed automated tests use pinned `localstack/localstack:4.14.0`, the
final pre-account Community release, so CI remains self-contained. Set
`LOCALSTACK_TEST_IMAGE=localstack/localstack:2026.08.3` together with a token to
exercise the exact Compose release through Testcontainers.
Snapshot persistence is a token-gated LocalStack capability: the committed
runtime enables it with `PERSISTENCE=1` and a named volume, while restart QA
must use the exact authenticated runtime rather than the Community test image.

The API uses `S3_ENDPOINT=http://localstack:4566` for HEAD/DELETE and
`S3_PUBLIC_ENDPOINT=http://localhost:4566` when generating browser-reachable
URLs. In Amazon S3 production deployments both endpoints may be omitted. The
AWS SDK then uses normal endpoint discovery and credential-provider chain, so
IAM roles work without permanent keys in application configuration.

The production bucket is private, bucket-owner-enforced, Block Public Access,
SSE-S3 encrypted, versioned, TLS-only, and protected from force destroy. CORS
allows only the exact HTTPS web origin and required GET/HEAD/PUT headers. The API
task role signs and verifies objects under `trips/*`; the worker has a narrower
delete-only role. Versioning provides recovery history but does not change
DB-first product deletion semantics. See [AWS deployment](./aws-deployment.md).
