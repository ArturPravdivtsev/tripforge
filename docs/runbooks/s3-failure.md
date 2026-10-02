# S3 failure and version recovery

Symptoms: browser direct PUT/download failure, completion HEAD error, cleanup
failures/old outbox. Usually SEV-2, SEV-1 if widespread authorized data access or
integrity is at risk. Core PG readiness must remain 200 when only S3 fails.

1. Inspect AWS S3/service health, target region, scoped task-role Get/Put/Delete
   permissions, TLS, exact-origin CORS, signing expiry and correct bucket. Check
   safe error categories, worker failures and pending vs ready metadata. Never
   log a signed URL/key or make the private bucket public to diagnose.
2. S3 HEAD/Delete now has a total 10s abort bound. Preserve pending metadata;
   don't label an unverified upload ready. Recover credentials/network/service,
   then explicitly retry completion/upload through normal UI. Cleanup relies on
   durable outbox and bounded backoff, not a hot retry loop.

## Approved version recovery

Requires recovery-role version permissions (ordinary API/worker roles do not
gain broad recovery rights). For an explicitly selected affected object:

1. List versions/delete markers read-only; identify exact key/version using
   authorized private incident context. Confirm owner/Trip/document authorization.
2. If a delete marker hides valid latest bytes, remove **only that marker's
   VersionId**, not all versions or the bucket. Confirm marker is really the target.
3. To recover an older version, copy that exact version to the same key as a new
   current version; preserve/review ContentType and metadata. Do not permanently
   delete history. Reconcile PG metadata/outbox: restoring bytes alone does not
   restore a deleted document record or authorize access.
4. Verify bytes/hash, HEAD, correct authorized UI and outsider denial. Preserve
   evidence of the selected source and new current version.

Local emulator proof: v1/v2, delete-marker removal, selected-version copy and
byte equality passed. AWS durability/IAM recovery remains pending. See
[AWS delete-marker management](https://docs.aws.amazon.com/AmazonS3/latest/userguide/ManagingDelMarkers.html).
No unsafe bulk delete command is provided. Escalate missing versions/corruption
to data owner; record recovery selection, verification and remaining metadata debt.
