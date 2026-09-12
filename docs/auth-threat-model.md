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
| User reads another user's trip | Owner-scoped database query |
| User updates another user's trip | Owner-scoped database mutation |
| User deletes another user's trip | Owner-scoped database mutation |
| User guesses a trip UUID | Foreign and nonexistent trips both return `404` |
| Client forges `ownerId` | Owner comes from the session; unknown input fields are rejected |

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
- Expired sessions are deleted opportunistically. Scheduled cleanup is not yet
  required for correctness.
- Automatic Argon2 rehash-on-login is not enabled, but the password abstraction
  can detect hashes that no longer match current parameters.
- UUID unpredictability is defense in depth, not authorization. Trip access is
  authorized by owner-scoped SQL predicates.

## Operational rules

Do not put passwords, password hashes, raw session tokens, token hashes, or full
Cookie headers in logs, URLs, query parameters, analytics, or JSON responses.
Production must terminate HTTPS before accepting the `__Host-` Secure cookie.
