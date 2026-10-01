# Authentication threat model

## Assets and boundary

TripForge protects account credentials and authenticated browser sessions. The
trust boundary is the Nest API: plaintext passwords enter only for hashing or
verification, and raw session tokens enter only through the HttpOnly cookie.
Neither may be logged or persisted in raw form.

| Threat | Current mitigation |
| --- | --- |
| Database password disclosure | Salted Argon2id hashes with explicit cost parameters |
| Session database leak | Only deterministic SHA-256 token hashes are stored |
| Session guessing | 32 cryptographically random bytes per token |
| Cookie theft via JavaScript | `HttpOnly` |
| Network cookie exposure | `Secure` in production |
| Cross-site cookie sending | `SameSite=Lax` |
| Login account enumeration | Generic `INVALID_CREDENTIALS` response |
| Login timing shortcut | Unknown users still trigger a valid dummy Argon2 verification |
| Session fixation | Fresh token after every registration/login; no anonymous sessions |
| Stolen session logout | Server-side row deletion immediately revokes the session |
| Half-created account | User, credential, and session share one transaction |
| Credential stuffing / online guessing | Shared Redis IP + normalized-account limits across API nodes |
| CSRF | `SameSite=Lax`, exact mutation `Origin`, required custom header, and JSON-only body endpoints |
| Cross-origin response access | Exact credentialed CORS allowlist; no wildcard origin |
| Duplicate-register enumeration | Accepted MVP UX/security tradeoff; `409` reveals existence |
| Credential/session logging | Passwords, hashes, raw tokens, and full Cookie headers are prohibited |
| Nonmember reads a Trip | Access-scoped SQL; inaccessible IDs return `404` |
| Viewer edits a Trip | Owner/editor-constrained SQL mutation |
| Editor deletes a Trip | Owner-constrained SQL mutation |
| User guesses a trip UUID | Foreign and nonexistent trips both return `404` |
| Client forges `ownerId` | Owner comes from the session; unknown input fields are rejected |
| Client forges a membership role | Server resolves current membership from PostgreSQL |
| Client forges ownership | Owner remains exclusively in `trips.owner_id` |
| Revoked member keeps access | Permission is read from PostgreSQL on every resource request |
| Session contains a stale Trip role | Trip IDs and roles are never stored in auth sessions |
| Viewer edits destinations or Days | Role-authorized mutations return `403` |
| User references another Trip's destination | Scoped lookup plus composite database FK |
| User accesses unrelated Days | Parent Trip access scope returns `404` |
| Client forges destination position | Server owns and normalizes positions |
| Partial reorder corrupts order | Complete-set validation and one transaction |
| Failed date sync partially mutates Trip | Trip update and Day reconciliation share one transaction |
| Viewer mutates itinerary | Current database-backed role authorization returns `403` |
| Item moves to another Trip's Day | Trip-scoped Day and complete-set validation |
| Foreign item enters reorder | Affected-Day union must exactly equal supplied item IDs |
| Failed reorder partially persists | Validation and every position/Day update share one transaction |
| Date shrink destroys plans | Locked populated-Day check returns `409` before mutation |
| Client forges item position | Position is not writable in CRUD; reorder normalizes it |
| Stale user sees cached itinerary | Authentication transitions remove the `['trips']` cache tree |
| Viewer changes destination coordinates | Existing role authorization returns `403` |
| Client sends invalid coordinate values | Service finiteness/range validation plus PostgreSQL CHECK constraints |
| Client sends a partial coordinate pair | PATCH presence validation plus PostgreSQL pair CHECK |
| Public map key is reused elsewhere | MapTiler allowed-origin restriction, quotas, rotation, and separate environment keys |
| Map provider is unavailable | Local error isolation; canonical destination and itinerary UI remains usable |
| Malicious client sends invalid itinerary-place coordinates | Nested DTO validation plus PostgreSQL state/range CHECK constraints |
| Client claims fake MapTiler provenance | Provider/reference fields are untrusted non-security metadata |
| Search result contains malformed external data | Focused Zod validation before normalization or UI consumption |
| Search provider outage breaks item editing | Optional query/component boundary; normal form and stored snapshots remain usable |
| Search queries leak into application logs | TripForge does not proxy, persist, or intentionally log autocomplete text |
| ORS API key exposed | Server-only environment value; absent from browser builds, responses, and logs |
| Client forges route geometry | Browser submits only endpoint IDs and TripForge mode; Nest generates geometry |
| Foreign Trip route endpoint IDs | Trip-scoped endpoint lookup plus transactional revalidation |
| Endpoint changes during provider request | Exact coordinate snapshots revalidated under short row locks |
| Provider sends malformed route geometry | Focused runtime validation before persistence |
| Routing outage breaks Trip viewing | Saved snapshots remain readable; mutation failure is isolated |
| Viewer calculates or deletes routes | Database-backed role authorization returns `403` |
| Viewer mutates reservation | Trip RBAC returns `403` |
| Foreign itinerary item linked | Trip-scoped item validation returns `ITINERARY_ITEM_NOT_FOUND` |
| Item deletion destroys booking | Reservation FK uses `ON DELETE SET NULL` |
| Invalid transport subtype | Complete-state validation plus atomic core/subtype transaction |
| Cancelled provider booking implied | UI states that TripForge does not contact providers |
| Unrelated user reads confirmation code | Trip-scoped authorization and anti-enumerating `404` |
| Client sends fractional or unsafe money | Integer minor-unit DTO validation and database range checks |
| Expense shares do not equal total | Exact transactional aggregate validation |
| Foreign participant enters an expense | Current/historical Trip participant validation |
| Removed member history disappears | Expense payer/share FKs are independent of membership rows |
| Foreign reservation linked to expense | Trip-scoped reservation lookup |
| Viewer edits financial data | Database-backed Trip RBAC returns `403` |
| Cross-currency total misleads users | No implicit FX conversion or combined grand total |
| Viewer uploads, edits, or deletes a document | Database-backed Trip RBAC returns `403` |
| Unrelated user discovers document existence | Trip-scoped authorization and anti-enumerating `404` |
| Pending or incomplete object is exposed | Pending metadata is excluded from list/download routes |
| Client lies about uploaded bytes or MIME type | Completion verifies authoritative S3 HEAD size and content type |
| Client chooses a storage key | API generates an opaque UUID-based key and never returns it |
| Presigned URL grants long-lived access | Upload/download capabilities expire after 10/5 minutes |
| Browser uploads an unsigned or altered request | Private bucket plus SigV4 validation; signed Content-Type is exact |
| File is linked across Trips | Trip-scoped lookup plus database foreign keys |
| Link deletion destroys document history | Optional link FKs use `ON DELETE SET NULL` |
| Removed member loses attribution | Uploader FK is independent of membership rows |
| Redis unavailable during delete | PostgreSQL mutation and cleanup outbox commit atomically; API has no Redis dependency |
| Worker executes a duplicate cleanup job | Completed outbox state plus idempotent S3 deletion |
| Queue payload is forged with an object key | Payload contains only a validated outbox UUID; PostgreSQL owns the key |
| Stale pending upload leaves a private object | Hourly bounded cleanup moves old pending rows into the durable outbox |
| Trip deletion leaves document objects | All keys are captured into outbox rows before the Trip cascade |
| Redis queue data is lost | Dispatcher reconstructs work from incomplete PostgreSQL outbox rows |
| Cleanup fails permanently | Finite retries, retained failed BullMQ job, and incomplete/failed outbox evidence |
| Worker leaks a signed URL or credentials | Jobs/logs contain no signed URLs, credentials, file bytes, or object keys |
| Object key leaks through API or logs | Transport contracts omit keys; signed URLs and credentials are not logged |
| Dangerous inline content executes in TripForge origin | Allowlisted MIME types and attachment-only download disposition |
| Cross-site WebSocket handshake | Socket.IO `allowRequest` requires exact `Origin === WEB_ORIGIN` |
| Socket connects without authentication | Existing HttpOnly cookie is resolved through the shared session service during handshake |
| Session token leaks through WebSocket URL | No token query/auth payload; the cookie is the only credential |
| Logged-out session keeps sockets | Session room is disconnected across API nodes after database revocation |
| Socket outlives absolute session expiry | Bounded expiry timer disconnects it at the persisted expiry |
| User joins a guessed Trip room | Runtime UUID validation plus fresh PostgreSQL permission check before every join |
| Revoked member stays in a Trip room | Targeted event plus server-side cross-node room eviction; rejoin reauthorizes |
| Role downgrade depends on UI timing | REST resolves the current role and returns `403` even before the refetch finishes |
| Malformed realtime payload corrupts UI | Browser Zod schemas reject unknown or invalid event payloads |
| Redis becomes an authorization source | PostgreSQL remains authoritative; Redis carries only best-effort invalidation/presence traffic |
| Presence discloses private profile data | Only user ID and display name are sent to already authorized Trip room members |
| User reads another inbox | Every notification query and mutation is scoped by the authenticated user ID |
| User guesses a notification UUID | Foreign and unknown IDs both return `NOTIFICATION_NOT_FOUND` |
| Revoked user follows an old notification | Targets are derived from current PostgreSQL Trip access; inaccessible targets are null |
| Trip/user deletion destroys notification context | Non-sensitive Trip and actor display snapshots are persisted before nullable FKs are cleared |
| Notification payload leaks sensitive domain data | Closed payload variants omit money, confirmation codes, object keys, signed URLs, and raw records |
| Failed notification write leaves partial domain state | Domain change and notification insert share one PostgreSQL transaction |
| Redis loss drops an inbox item | PostgreSQL stores the item; Redis carries only an empty best-effort invalidation |
| Cached inbox crosses accounts | Every authentication transition removes the `['notifications']` query tree |
| User searches a guessed Trip UUID | Current Trip readability is checked before source-table search; inaccessible and missing Trips return the same `404` |
| Search leaks another Trip's row | Every SQL branch has an explicit parent Trip predicate, including itinerary through its Day |
| Search exposes sensitive booking/financial/storage data | Confirmation codes, money/share/payer/balance data, storage metadata, file content, and pending documents are absent from vectors and results |
| Search query injects SQL or tsquery syntax | Drizzle parameters plus `websearch_to_tsquery` treat input as data; hostile syntax is integration-tested |
| Search result redirects off-site | Shared contracts expose only closed typed domain targets; the browser maps them to internal routes |
| Cached search crosses accounts | Search lives below `['trips']`, which every authentication transition cancels and removes |

## Residual and deferred risk

- CORS is not treated as CSRF protection by itself: it controls browser response
  access and preflight, while some cross-site requests can still reach a server.
  TripForge separately rejects browser mutations unless `Origin` exactly equals
  `WEB_ORIGIN` and `X-TripForge-Request` equals `1`; register, login, Trip create,
  and Trip PATCH requests must also use JSON.
- Authentication limits fail closed when shared Redis is unavailable; ordinary
  low-risk reads deliberately do not acquire that dependency.
- Account verification, recovery, MFA, password changes, provider login, bulk
  session revocation, and security event logging remain future controls.
- Duplicate registration intentionally has a stable distinct response for MVP
  usability. Email verification should revisit that enumeration tradeoff.
- Add-member returns `INVITEE_NOT_FOUND` to an authenticated owner when an email
  has no account. This existing-account MVP flow permits targeted account
  enumeration; a future invitation flow should remove that dependency.
- Expired sessions are deleted opportunistically. Scheduled cleanup is not yet
  required for correctness.
- Successful login automatically replaces an older valid Argon2 hash when the
  password abstraction reports that the current policy requires rehashing.
- UUID unpredictability is defense in depth, not authorization. Trip access is
  authorized by ownership or current membership in SQL.
- Final cleanup failures currently require operational inspection and manual
  remediation; an admin retry UI and alerting belong to later observability work.
- A presigned download URL issued before deletion can remain valid until its
  five-minute expiry; asynchronous object cleanup is not instant revocation.
- Presence is approximate room membership, not durable online status. It has no
  database history, last-seen value, cursor, typing, or activity semantics.
- Networks that block WebSockets lose realtime freshness because Stage 21 has
  no polling fallback; authenticated REST behavior remains available. The
  notification inbox still refreshes on navigation and ordinary query lifecycle.

## Operational rules

Do not put passwords, password hashes, raw session tokens, token hashes, or full
Cookie headers in logs, URLs, query parameters, analytics, or JSON responses.
Production must terminate HTTPS before accepting the `__Host-` Secure cookie.
See [Security hardening](./security-hardening.md) for the full application
boundary, rate-limit policy, CSP, ASVS-informed mapping, and release checklist.
