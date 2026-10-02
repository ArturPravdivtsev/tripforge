# Routing provider outage

Symptoms: new/recalculated routes return controlled `ROUTING_PROVIDER_UNAVAILABLE`
or `ROUTING_PROVIDER_RATE_LIMITED` 503. SEV-2 while persisted Trip/routes remain
usable. Do not conflate provider-bound latency with core metadata SLO.

1. Inspect ORS outcome/duration and safe route.calculate spans, configured secret
   reference, NAT/HTTPS egress, quota and provider status. Verify persisted route
   list and core/ready independently. Do not log coordinates/raw provider payloads.
2. ORS request uses 9s AbortSignal. Keep controlled retry UX; no hot-loop retries,
   transaction held across provider call or fabricated “successful” route.
   Cached/persisted geometry stays authoritative for its saved version.
3. Restore service/configuration or wait for rate-limit recovery. Rotate secret
   and restart injected tasks only with approval. Do not weaken permissions or
   rewrite stored routes to hide an outage.

Local DI boundary + real POST `/routes` returned 503, persisted listing remained
available and no route row was created; integration regression also covers saved
route behavior. Real provider/NAT browser smoke is pending. Recovery: explicitly
approved disposable route succeeds, list reflects persisted result, quota/errors
normalize and core latency remains stable. Escalate prolonged quota/account/
network issue; record category, external vs core impact and verification.
