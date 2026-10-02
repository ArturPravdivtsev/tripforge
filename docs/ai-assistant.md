# AI Trip Assistant

Stage 30 adds a private, grounded assistant to each Trip. The model is a planner,
analyst, navigator, and proposal generator. It is not an authorization boundary
and cannot mutate Trip business data directly.

## Architecture and state

```text
Browser -> Nest AI API -> TripForge conversation in PostgreSQL
        -> OpenAI Responses API -> bounded TripForge tools
        -> final answer + proposal drafts -> human Apply
        -> existing itinerary domain service/repository -> trip:invalidate
```

TripForge owns conversations, turns, proposal states, retention, pruning, and
authorization. The integration does not use OpenAI Conversations, Assistants,
provider thread IDs, or `previous_response_id`. Each request supplies at most the
12 latest completed turns and a 24,000-character history budget.

The server uses `openai@7.27.0`, the Responses API, and `gpt-6-luna` by default.
`OPENAI_MODEL` changes the model without changing product contracts.
`OPENAI_REASONING_EFFORT` accepts `none`, `low`, `medium`, `high`, `xhigh`, or
`max`; the default is `medium`. Output is capped at 1,500 tokens, provider work
at 45 seconds, and a turn at four tool rounds/eight tool calls.

## Privacy and provider storage

Every Responses request explicitly sets `store:false`. TripForge does not ask
OpenAI to persist response application state. This does not mean that no
provider-side processing or abuse-monitoring retention exists. OpenAI documents
the distinction in its [API data controls](https://developers.openai.com/api/docs/guides/your-data).
OpenAI API data is not used for training unless the API customer explicitly opts
in; TripForge does not claim that OpenAI stores absolutely nothing.

Data that may be sent:

- the current user's assistant message;
- bounded recent history from that user's conversation;
- minimal, bounded Trip data returned by a requested tool.

Data excluded:

- session/password data and AWS, Redis, or OpenAI credentials;
- S3 storage keys, ETags, presigned URLs, and document contents;
- reservation confirmation codes;
- another Trip or another user's assistant history;
- raw SQL, provider HTTP bodies, and full route geometry.

TripForge conversations remain in PostgreSQL until their owner deletes them or
their parent Trip/user is deleted. Conversations are private per user, even among
members of the same Trip. A removed member cannot access prior conversations;
re-adding the same user restores access while those rows still exist.

## Grounding and tools

Tool output is untrusted user data, never instructions. IDs for the current Trip
and user are injected by the server and do not appear in model tool schemas.
Strict JSON schemas use `additionalProperties:false`; runtime validation still
runs before services/repositories.

Read-only tools:

- `get_trip_overview`
- `get_trip_days` (maximum 14 days)
- `get_itinerary` (maximum 100 items)
- `search_trip` (reuses Stage 23; maximum 10 results)
- `get_reservations` (no confirmation code)
- `get_expense_summary` (authoritative Stage 18 calculations)
- `get_documents` (metadata only)
- `get_routes` (summary only, no geometry or ORS call)

Stage 30 has no web search, MCP, shell, computer use, code interpreter, File
Search, vector store, document vision, image, or voice access. The assistant must
state that live weather, delays, opening hours, prices, and visa rules cannot be
verified.

## Proposals and authorization

Supported proposals are exactly `itinerary_create`, `itinerary_update`, and
`itinerary_move`. Create proposals append and cannot fabricate place snapshots.
Update proposals are limited to title, kind, start/end time, and notes. Move uses
the existing day/position semantics. There are no destructive proposal tools.

Proposal drafts remain in memory until a model turn completes. Completion stores
the assistant turn and its proposals in one transaction. Failed/aborted turns
store no proposal rows.

Apply is explicit. It rechecks current owner/editor permission, locks the
proposal, validates its typed payload and current Trip references, runs the
existing itinerary domain service and repository inside the same transaction,
marks the proposal applied, and publishes normal itinerary invalidation.
Missing/changed references mark a proposal `stale` and return `409
AI_PROPOSAL_STALE`. Repeated Apply is idempotent. Viewers may read suggestions
but cannot apply them.

## API and streaming

```text
GET    /api/trips/:tripId/assistant/conversations
POST   /api/trips/:tripId/assistant/conversations
GET    /api/trips/:tripId/assistant/conversations/:conversationId
DELETE /api/trips/:tripId/assistant/conversations/:conversationId
POST   /api/trips/:tripId/assistant/conversations/:conversationId/turns
POST   /api/trips/:tripId/assistant/proposals/:proposalId/apply
POST   /api/trips/:tripId/assistant/proposals/:proposalId/dismiss
```

Turns use `text/event-stream`, `private, no-store`, and typed
`assistant.ready`, `assistant.delta`, `assistant.tool`, `assistant.completed`, and
`assistant.error` events. Provider events, raw tool arguments, database output,
and hidden reasoning are never forwarded. Stop/disconnect aborts the provider
request and fails an existing pending turn. Token deltas remain local to the UI;
completion reconciles TanStack Query from the persisted turn. AI conversations
are not broadcast through Socket.IO.

Errors detected before streaming keep normal HTTP semantics: TripForge
throttling is `429`, conversation/proposal conflicts are `409`, and unavailable
configuration is `503`. A turn establishes its HTTP 200 SSE stream before the
provider request; provider capacity, outage, and timeout therefore arrive as
stable `assistant.error` codes (`AI_PROVIDER_BUSY`,
`AI_PROVIDER_UNAVAILABLE`, and `AI_ASSISTANT_TIMEOUT`) rather than a later HTTP
status change. `/health` never calls OpenAI.

## Safety, limits, and telemetry

`omni-moderation-latest` checks input before a pending turn or main generation.
Flagged input does not call the main model. A moderation outage fails closed for
the optional feature. Streaming cannot retroactively hide text already sent;
provider refusals are respected.

Authenticated limits are 10 turns/minute and 100 turns/day. Conversation creation
is limited to 20/hour. Metrics use only bounded model, outcome, tool, and
proposal-type labels. Logs/traces never contain prompts, answers, notes, search
queries, user IDs, Trip IDs, or conversation IDs. Token counts are durable facts;
no USD cost is stored.

## Configuration and evaluation

The assistant is disabled unless `AI_ASSISTANT_ENABLED=true` and
`OPENAI_API_KEY` is available server-side. Missing configuration returns
`503 AI_ASSISTANT_UNAVAILABLE`; non-AI functionality remains operational. The key
must never use a `NEXT_PUBLIC_*` name or enter browser bundles/logs.

`pnpm ai:test` and `pnpm ai:eval` are deterministic and require no provider key.
`pnpm ai:eval:live` is optional, paid, and requires an explicitly supplied key;
it checks Responses streaming, a strict tool call, and `store:false`. Live
evaluation is not a PR CI gate.
