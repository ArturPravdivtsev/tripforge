# Backend architecture

The Nest API is the single authenticated HTTP mutation boundary. Controllers
validate transport input, services enforce domain and current PostgreSQL-backed
Trip permissions, and repositories own persistence and transaction boundaries.

After a successful commit, domain services call the focused
`TripRealtimePublisher`. It emits small cache-invalidation signals through the
Socket.IO Redis Streams adapter; it never performs domain writes. Publication
failure cannot undo or fail durable business state.

```text
REST controller → service/RBAC → repository transaction → PostgreSQL commit
                                  ├→ domain row + durable notifications
                                  │
                                  └─ after commit → realtime publisher
                                                        → Redis Streams
                                                        → API nodes/rooms
```

The default Socket.IO namespace authenticates the existing HttpOnly session,
while each `trip:join` independently authorizes current access. Internal
session, user, and Trip rooms support logout disconnect, targeted revocation,
and collaboration fan-out. See [Realtime collaboration](./realtime.md).

The worker remains a separate Nest application context. Its BullMQ connections
and durable PostgreSQL outbox are independent from the API's best-effort
realtime adapter; a failure in either Redis consumer does not make Redis the
source of business truth.

The notification module exposes a user-scoped inbox, compound cursor
pagination, unread count, and read-state mutations. Domain repositories call
focused notification writers inside their existing SQL transactions. Writers
snapshot display context and compute recipients set-wise; they do not call HTTP,
Redis, or BullMQ. Repository reads batch current Trip-access resolution so list
serialization does not create an N+1 query pattern. See
[Persistent notifications](./notifications.md).
