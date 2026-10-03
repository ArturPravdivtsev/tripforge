# TripForge interview guide

[Overview](../README.md) · [Case study](./portfolio-case-study.md) · [Evidence](./portfolio-evidence.md)

Use these as prompts, not a script claiming employment or experience that did
not happen. Say explicitly that implementation was AI-assisted and that cloud,
live-provider and manual assistive-technology qualification remain pending.

## 30-second pitch

“TripForge is my AI-assisted portfolio project: a collaborative travel workspace
with itineraries, bookings, shared expenses, private documents and a constrained
assistant. I focused on frontend engineering with end-to-end ownership: how
forms, permissions and reconnects remain correct when requests or dependencies
fail. It is an unreleased candidate with local database, Chromium and recovery
qualification, not a product with claimed production traffic.”

## Two-minute pitch

“Travel planning mixes a schedule, tickets, costs and messages. I brought them
into one Trip-scoped workspace, using Next/React for the UI and Nest/PostgreSQL
for authoritative state. The frontend work includes responsive forms, optimistic
reordering with rollback, accessible non-drag Move, lazy maps and streamed AI
interaction. Remote data, unsaved form values and transient UI state have distinct
owners so a background refetch does not erase an edit.

“The interesting decisions were about boundaries. Opaque sessions and current
membership checks support revocation. Sockets send invalidations, not a second
copy of truth. A PostgreSQL outbox preserves S3 cleanup intent across Redis loss.
The model receives bounded read-only tools; changes stay proposals until a human
applies them through the normal permission-checked domain transaction.

“I used a staged, AI-assisted workflow and evidence-based review. The retained
qualification includes 12 Chromium scenarios, 13 recovery drills and a 30-minute
local soak with 100 sockets. Those are deliberately scoped results: AWS effective
IAM/restore/failover, live providers and manual AT remain pending. I would discuss
the decisions, tests and failure analysis rather than claim to have manually
written every line or run this at production scale.”

## Five-minute walkthrough

1. **0:00–0:45 — Product:** itinerary/expenses/assistant screenshots; describe
   the user problem and what the app does not attempt (booking/FX/live-hours proof).
2. **0:45–1:45 — Frontend:** server shell/client leaves, query versus form state,
   optimistic rollback and accessible Move; connect UX to correctness.
3. **1:45–2:45 — Boundaries:** auth/revocation, invalidation/refetch and durable
   cleanup; explain one rejected alternative and its cost.
4. **2:45–3:45 — AI and delivery:** read-only tools, explicit Apply, untrusted
   notes; trusted publication and migration-before-rollout without a cloud claim.
5. **3:45–5:00 — Evidence and limits:** one Redis-loss recovery, measurement
   context, OS findings/client heap drift, AI-assisted ownership and next work.

## Twelve deep-dive questions

Each answer should cover context → decision → trade-off → evidence → next step.

### 1. Why opaque sessions rather than JWT?

Trip membership and logout must take effect promptly. Random cookie tokens are
hashed in PG; HTTP and sockets use current authorization. The cost is stateful
lookups. [Authentication](./authentication.md) and browser revoke scenarios show
the behavior. Next: measure deployed DB headroom before changing session caching.

### 2. How do you separate frontend state owners?

Refetch must not clobber edits. Next provides the shell, Query remote data, RHF
form values and React/URL transient state. This adds explicit reconciliation but
avoids one global mutable store. [Server state](./server-state.md) explains the
boundaries. Next: profile real interaction latency rather than memoize everything.

### 3. What happens if optimistic reorder fails?

DnD immediately reflects intent, but the server remains authoritative. Snapshot
rollback and deferred itinerary refetch during drag preserve a consistent list;
other resources remain live. The cost is lifecycle complexity. [E2E](../e2e/qualification.spec.ts)
exercises pointer/keyboard/non-drag paths. Next: manual AT and extended concurrent edits.

### 4. Why invalidations instead of full socket state?

Replicas and reconnects miss events. Closed resource invalidations trigger fresh
authorized reads. Extra HTTP reads buy simple gap repair. [Realtime](./realtime.md)
retains the two-node/100-client drill, not a production percentile. Next: measure
deployed reconnect storms and Redis failover before asserting capacity.

### 5. Why an outbox if BullMQ already retries?

Retries cannot recover a job never enqueued after a PG commit. Cleanup intent
commits with metadata; a dispatcher reconstructs queue work. Delivery is
at-least-once and deletion eventual. [Jobs](./background-jobs.md) and the
[drills](../scripts/readiness/qualify.mjs) cover FLUSHDB recovery. Next: cloud
backlog alert/retention/reconciliation qualification.

### 6. Why are notifications different?

They are already business rows in the originating transaction; sockets only
refresh the inbox. Another queue would add a dual write without a durability
benefit. [Notifications](./notifications.md) describes the contrast. Next:
validate product retention/volume requirements before adding delivery channels.

### 7. What makes document uploads private?

RBAC grants short capabilities; direct PUT is followed by HEAD size/type checks
before ready publication. This avoids API byte proxying but adds pending/finalize
states, and issued URLs persist until expiry. [Documents](./documents.md) is the
source. Next: effective AWS IAM/CORS/TLS, malware policy and repeated-upload profiling.

### 8. Why PG search and integer expense amounts?

Existing bounded Trip data does not justify a separate search cluster. FTS/trigram
remain permission-scoped; money stays integer minor units with exact deterministic
shares and per-currency settlement. [Search](./search.md), [expenses](./expenses.md)
and real PG tests ground the story. Next: measure actual data distribution;
never turn warm SQL timing into HTTP latency or invent FX conversion.

### 9. What accessibility work changed the product?

Keyboard DnD alone is insufficient for non-drag pointer access. Move provides an
ordinary click/touch alternative and shares the domain path. Six Chromium axe
screens and keyboard/reflow tests help but are not certification.
[Accessibility](./accessibility.md) records manual debt. Next: VoiceOver/Safari,
native zoom, text spacing and forced-color review.

### 10. What did profiling make you change—or not change?

Initial-route graphs showed realtime/MapLibre boundaries mattered more than
total bundle bytes. Lazy boundaries reduced historical initial cost; ten budgets
guard regressions. [Performance](./performance.md) retains compiler/context and
warm SQL limitations. Next: field Web Vitals and longer heap retention-path
profiling; the observed +1.344 MiB client/harness drift is not a proven leak.

### 11. How do delivery and diagnostics survive failure?

Safe request IDs/traces and bounded metrics expose pool/backlog causes. PRs cannot
publish or acquire AWS credentials; protected promotion requires migration exit
zero. [Observability](./observability.md), [CI/CD](./ci-cd.md) and local fake-AWS
shell tests provide evidence. Next: actual cloud rollout/restore/failover and
release-owner review of unfixed Debian findings, not an automatic clean-image claim.

### 12. What authority does AI have, and what did you own?

The model can read bounded authorized tool output and draft typed proposals, not
mutate directly. Explicit Apply rechecks RBAC/references in a locked transaction.
This trades convenience for authority separation. [AI](./ai-assistant.md) covers
privacy/idempotency/Stop tests with a deterministic provider. Implementation was
AI-assisted; ownership concerns scope, decisions, review and failure analysis,
not manual typing of every line. Next: live-provider privacy/cancellation/cost QA;
`store:false` alone does not establish Zero Data Retention.

## CV-sized project description

TripForge — AI-assisted personal portfolio project: collaborative travel planner
using Next.js/React, TypeScript, NestJS and PostgreSQL. Frontend-focused end-to-end
work on accessible stateful interactions, RBAC, realtime freshness, durable jobs
and human-approved AI; local Chromium/integration/resilience qualification,
with AWS deployment configured but cloud qualification pending.

This is proposed project wording only; no actual CV, title or employment record
has been changed.
