# Realtime collaboration

TripForge realtime is a freshness layer, not a second mutation API.

```text
Editor A
   │ REST mutation
   ▼
API instance A
   ├── PostgreSQL commit
   └── Socket.IO invalidation
              │
              ▼
        Redis Streams
         ┌────┴────┐
         ▼         ▼
       API A     API B
                    │
                    ▼
                Viewer B
                    │
                    ▼
             TanStack refetch
```

The source-of-truth boundaries are explicit:

- PostgreSQL is durable business truth.
- REST is the only business mutation path.
- Socket.IO is a best-effort freshness notification layer.
- Redis Streams carries realtime messages between API nodes.
- TanStack Query is the browser's disposable server-state cache.

## Transport and security

The default Socket.IO namespace uses the fixed `/socket.io` path and only the
`websocket` transport. WebSocket-only deployment does not require sticky HTTP
sessions and has less protocol overhead, but networks that block WebSockets get
no long-polling fallback. REST remains fully usable when realtime is unavailable.

The browser connects to the web origin, sharing its host-only session cookie
with HTTP. The existing Next.js Proxy rewrites the upgrade using server-runtime
`API_ORIGIN` and validates `WEB_ORIGIN`; see [hosted demo](./hosted-demo.md).

The server requires the handshake `Origin` to equal `WEB_ORIGIN` through
Socket.IO `allowRequest`. Credentialed CORS is configured with the same exact
origin as an additional consistency control; it is not treated as the primary
WebSocket origin defense. The browser sends the existing HttpOnly session cookie
with credentials. No session token appears in a URL, browser storage, or a new
JWT scheme.

Handshake middleware reuses `SessionService`: it reads the configured cookie,
hashes and resolves the opaque token using the existing session rules, validates
absolute expiry, and loads its user. Missing, invalid, or expired sessions are
rejected with stable public auth error data. `socket.data` contains only user ID,
session ID, display name, expiry time, and joined Trip IDs; it never contains the
raw token or a full user record.

Every socket joins internal `session:{sessionId}` and `user:{userId}` rooms.
HTTP logout revokes the database session and disconnects that session room on
all API nodes. A bounded timer disconnects a socket at absolute session expiry.

## Trip authorization and events

The client explicitly sends `trip:join` with a runtime-validated UUID. Every
join asks PostgreSQL for the user's current effective owner/editor/viewer role;
roles are never cached in the auth session or trusted from the handshake.
`trip:leave` is idempotent, and one socket may technically join multiple
`trip:{tripId}` rooms.

Server events are shared in `@tripforge/contracts` and runtime-validated in the
browser:

- `trip:invalidate` carries a Trip ID plus finite resource names;
- `trip:deleted` removes the Trip cache, redirects, and evicts its room;
- `trip:access-revoked` targets the removed user's room, redirects that user,
  and server-side evicts their sockets from the Trip room;
- `trip:presence` contains a current room snapshot deduplicated by user ID.
- `notifications:invalidate` is an empty user-room hint to refetch the durable
  inbox and unread count.

The finite invalidation resources are `trip`, `members`, `destinations`, `days`,
`itinerary`, `routes`, `reservations`, `expenses`, and `documents`. The backend
does not expose TanStack query keys or broadcast full entity snapshots.
Duplicate and out-of-order invalidations are safe because each means only
"authoritative state may have changed."

The browser also maps `destinations`, `itinerary`, `reservations`, `expenses`,
and `documents` to the active Trip search query prefix. `routes`, `days`,
`members`, and `trip` do not affect indexed search sources. Search remains a
REST refetch; realtime never transports queries or result snapshots.

The mutation mapping is intentionally small:

| Committed mutation | Resources/event |
| --- | --- |
| Trip name | `trip` |
| Trip date range | `trip`, `days`, `itinerary` |
| Trip deletion | `trip:deleted` |
| Member add/role change | `members`, `trip` |
| Member removal | targeted revoke, then `members`, `trip` |
| Destination create/update/reorder | `destinations` |
| Destination deletion | `destinations`, `days` |
| Day assignment | `days` |
| Itinerary CRUD/reorder | `itinerary`; place change/delete also `routes` |
| Route CRUD | `routes` |
| Reservation CRUD | `reservations` |
| Expense CRUD | `expenses` |
| Document completion/update/delete | `documents` |
| Notification-producing commit | targeted `notifications:invalidate` |

Publication happens only after repository work and its SQL transaction have
successfully returned. Redis calls never run inside SQL transactions. A publish
failure is logged and cannot roll back an already committed REST mutation.
`TripRealtimePublisher` is deliberately a focused boundary, not CQRS, event
sourcing, or a generic domain-event bus.

## Presence, reconnects, and conflicts

Presence means currently joined WebSocket sessions, deduplicated by user ID and
sorted deterministically. `fetchSockets()` makes snapshots include all API
nodes through the Redis Streams adapter. Presence is approximate and ephemeral:
it is not durable online status, last-seen history, or activity tracking.
Multiple tabs from one account appear once.

Socket.IO Connection State Recovery is disabled in Stage 21. Reconnect performs
a fresh cookie authentication and fresh database-backed `trip:join`, then
refetches every active Trip resource. Old rooms are not restored automatically;
this preserves current RBAC after downgrade or revocation.

During itinerary drag/reorder, remote itinerary invalidation is queued until
the local operation settles so the sortable tree does not shift under the user.
Other resource invalidations proceed normally. React Hook Form values remain
local while query caches refetch, so a remote update does not overwrite unsaved
input. If that form is later submitted, existing backend rules apply. Ordinary
concurrent edits are last-committed-write-wins; realtime accelerates cache
reconciliation but does not provide locks, merges, CRDTs, or collaborative text.

## Redis and durability

The API uses `@socket.io/redis-streams-adapter` with a dedicated ioredis
connection, stream/channel prefix `tripforge:socketio`, approximate maximum
length 10,000, and plaintext-only messages. Redis is not an authorization or
business-state store. API startup and REST health stay available while Redis is
temporarily unavailable; realtime may degrade and reconnect later.

Redis serves two isolated purposes:

- BullMQ is durable background-work delivery backed by the PostgreSQL cleanup
  outbox, because storage cleanup must eventually happen.
- The Socket.IO Redis Streams adapter is best-effort inter-node transport,
  because missed freshness hints are repaired by reconnect plus refetch.

Realtime events therefore do not use the Stage 20 transactional outbox and the
adapter stream is not audit storage.

Persistent notifications do not change that boundary. Their rows are committed
with the originating domain mutation in PostgreSQL; only the empty invalidate
hint crosses Redis. Missing, duplicate, and out-of-order hints are safe because
the browser refetches the whole notification query tree on an event and after
reconnect. See [Persistent notifications](./notifications.md).

## Verification

Unit/component tests cover origin comparison, room helpers, auth and join
validation, expiry, publisher eviction, resource-to-query mapping, runtime
payload schemas, status/presence UI, drag deferral, and form preservation. The
realtime integration suite starts real PostgreSQL, real Redis, two real Nest
Socket.IO servers, and real `socket.io-client` connections. It proves cross-node
mutation, role downgrade, revocation, deletion, logout disconnect, presence
deduplication, reconnect/rejoin, invalid-session rejection, and REST continuity
plus broadcast recovery through a temporary Redis command-processing pause.

## Observability

Bounded metrics expose active authenticated sockets, active Trip-room joins,
connect/disconnect events, rejected connections/joins, and cross-node publisher
failures. They never label by socket, session, user, or Trip. Safe logs cover
meaningful rejection and Redis adapter/publisher failures; routine presence
snapshots and invalidations are intentionally silent. Broad ioredis command
tracing is disabled to avoid payload/room leakage and noisy spans. See the
[realtime runbook](./observability.md#diagnosis-runbooks).
