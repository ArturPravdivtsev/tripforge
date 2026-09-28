# Persistent in-app notifications

TripForge stores a private inbox for each authenticated user in PostgreSQL.
Notifications are durable product state: Socket.IO only tells a connected
browser that the inbox may have changed, and TanStack Query then refetches the
authoritative rows.

## Supported events

The closed `user_notification_type` enum contains `trip_shared`,
`trip_role_changed`, `trip_access_revoked`, `trip_deleted`,
`reservation_added`, `expense_added`, and `document_ready`. The shared contract
uses a discriminated payload for exactly these types. Payloads contain only the
small fields needed to render copy, such as a role or title; expense amounts,
reservation details, document storage keys, and signed URLs are excluded.

Trip and actor names are captured as snapshots when a notification is written.
This keeps old copy intelligible after a rename, membership removal, user
deletion, or Trip deletion. `trip_id` and `actor_user_id` use `ON DELETE SET
NULL`; the recipient uses `ON DELETE CASCADE`. A target is returned only when
the recipient still has current access to the referenced Trip. Revocation and
deletion notifications never expose a target.

## Transaction and delivery boundary

Domain repositories write notifications in the same PostgreSQL transaction as
the mutation that caused them. A notification failure therefore rolls back the
membership, reservation, expense, document-ready, or deletion change. Activity
notifications fan out to the current owner and members except the actor; removed
members are not future recipients. Repeating the same role or document-ready
transition creates no duplicate notification.

After commit, the API emits an empty `notifications:invalidate` event to each
affected `user:{userId}` Socket.IO room. That event is best effort and contains
no notification data. A Redis outage can delay UI freshness but cannot lose the
PostgreSQL inbox; reconnect invalidates the notification query tree. Unlike S3
cleanup, notification creation needs no BullMQ job or outbox because it is
already atomic with the domain transaction.

## API and pagination

All endpoints require the existing browser session:

| Operation | Endpoint |
| --- | --- |
| list newest first | `GET /api/notifications?limit=20&cursor=...` |
| unread count | `GET /api/notifications/unread-count` |
| set read or unread | `PATCH /api/notifications/:notificationId` |
| mark every unread row read | `POST /api/notifications/read-all` |

The opaque, versioned base64url cursor contains `(createdAt, id)`. Queries use
the matching descending compound order, so equal timestamps do not create gaps
or duplicates. Limits are bounded to 1–50. A malformed cursor gets the stable
`INVALID_NOTIFICATION_CURSOR` response. Updating a foreign or unknown ID gets
the same `NOTIFICATION_NOT_FOUND` response. Repeating a read transition is
idempotent; in particular, repeated `read=true` preserves the first `read_at`.

## Browser behavior

The authenticated shell owns one Socket.IO lifecycle and a notification bell.
The bell displays no badge for zero, the exact count through 99, and `99+`
above it. `/notifications` uses an infinite query with an explicit **Load more**
button and deduplicates IDs defensively. Read/unread and mark-all interactions
optimistically update both list pages and the unread count, roll back on error,
then reconcile from the API.

Authentication transitions cancel and remove both the `['trips']` and
`['notifications']` cache trees. Notification data is never stored in browser
persistence. Target links are derived from the closed target contract rather
than payload strings.
