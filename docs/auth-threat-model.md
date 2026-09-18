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
| Credential stuffing / online guessing | Distributed rate limiting deferred; required pre-production |
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

## Residual and deferred risk

- CORS is not treated as CSRF protection by itself: it controls browser response
  access and preflight, while some cross-site requests can still reach a server.
  TripForge separately rejects browser mutations unless `Origin` exactly equals
  `WEB_ORIGIN` and `X-TripForge-Request` equals `1`; register, login, Trip create,
  and Trip PATCH requests must also use JSON.
- No in-memory limiter is presented as brute-force protection. A shared,
  deployment-aware rate limiter must precede public exposure.
- Account verification, recovery, MFA, password changes, provider login, bulk
  session revocation, and security event logging remain future controls.
- Duplicate registration intentionally has a stable distinct response for MVP
  usability. Email verification should revisit that enumeration tradeoff.
- Add-member returns `INVITEE_NOT_FOUND` to an authenticated owner when an email
  has no account. This existing-account MVP flow permits targeted account
  enumeration; a future invitation flow should remove that dependency.
- Expired sessions are deleted opportunistically. Scheduled cleanup is not yet
  required for correctness.
- Automatic Argon2 rehash-on-login is not enabled, but the password abstraction
  can detect hashes that no longer match current parameters.
- UUID unpredictability is defense in depth, not authorization. Trip access is
  authorized by ownership or current membership in SQL.

## Operational rules

Do not put passwords, password hashes, raw session tokens, token hashes, or full
Cookie headers in logs, URLs, query parameters, analytics, or JSON responses.
Production must terminate HTTPS before accepting the `__Host-` Secure cookie.
