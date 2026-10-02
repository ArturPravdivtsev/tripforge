# AI provider outage

Symptoms: `AI_ASSISTANT_UNAVAILABLE`, moderation failure, safe SSE error, elevated
AI outcome/duration metrics. SEV-2 optional-feature degradation while core works;
SEV-1 if a security/privacy issue appears. Do not page as full TripForge outage
only because OpenAI is unavailable.

1. Check safe AI turn/error metrics, API task secret reference/version, private
   NAT/HTTPS egress, configured model/timeouts/quota and provider status. Never
   print keys, prompts, tool outputs or hidden reasoning into diagnostics.
2. Confirm core/ready and existing persisted Trip data remain available.
   Moderation must fail closed. No provider response may apply a mutation without
   explicit authorized Apply; pending proposals remain inert.
3. Whole turn deadline is 45s below ALB idle 120s; SDK retry max 1 and user Stop/
   disconnect aborts. Avoid automatic resubmit loops or bulk paid “verification”.
   Restore configuration/rotation with operator approval, restart tasks for injected
   secret changes, then use a small approved disposable smoke only.
4. Preserve PG conversation/proposal state. Inspect stale pending recovery via
   normal API/integration behavior; do not clear history or mark proposals applied.

Local test-only DI failure produced a controlled safety/provider SSE error with
core/ready available. No live OpenAI network/cost/TTFT claim. Recovery requires
explicit small live test (TTFT, duration, tools/tokens, safe errors) plus privacy,
viewer Apply denial and no unauthorized writes. Escalate quota/account/egress or
privacy issues; record safe category, onset/recovery and paid test scope.
