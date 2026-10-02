"use client";

import { useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AiConversationDetail,
  AiProposal,
  AiSseEvent,
  AiTurn,
  ItineraryItem,
  TripDay,
} from "@tripforge/contracts";
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Label,
  Textarea,
} from "@tripforge/ui";

import { assistantApi } from "@/lib/api/assistant";
import { ApiClientError } from "@/lib/api/errors";
import { tripsApi } from "@/lib/api/trips";
import { tripKeys } from "@/lib/trips/query-keys";

type AssistantScreenProps = Readonly<{ tripId: string }>;

export function AssistantScreen({ tripId }: AssistantScreenProps) {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string>();
  const [message, setMessage] = useState("");
  const [streamedText, setStreamedText] = useState("");
  const [pendingUserMessage, setPendingUserMessage] = useState<string>();
  const [toolStatus, setToolStatus] = useState<string>();
  const [streamError, setStreamError] = useState<string>();
  const [isStreaming, setIsStreaming] = useState(false);
  const [completionAnnouncement, setCompletionAnnouncement] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const streamOutcomeRef = useRef<"completed" | "error" | undefined>(undefined);

  const conversationsQuery = useQuery({
    queryFn: ({ signal }) => assistantApi.listConversations(tripId, signal),
    queryKey: tripKeys.assistantConversations(tripId),
  });
  const conversations = conversationsQuery.data ?? [];
  const activeId = selectedId ?? conversations[0]?.id;
  const tripQuery = useQuery({
    queryFn: ({ signal }) => tripsApi.get(tripId, { signal }),
    queryKey: tripKeys.detail(tripId),
  });
  const conversationQuery = useQuery({
    enabled: Boolean(activeId),
    queryFn: ({ signal }) =>
      assistantApi.getConversation(tripId, activeId!, signal),
    queryKey: activeId
      ? tripKeys.assistantConversation(tripId, activeId)
      : [...tripKeys.assistant(tripId), "none"],
  });
  const daysQuery = useQuery({
    queryFn: ({ signal }) => tripsApi.listDays(tripId, { signal }),
    queryKey: tripKeys.days(tripId),
  });
  const itineraryQuery = useQuery({
    queryFn: ({ signal }) => tripsApi.listItineraryItems(tripId, { signal }),
    queryKey: tripKeys.itinerary(tripId),
  });

  const createMutation = useMutation({
    mutationFn: () => assistantApi.createConversation(tripId),
    onSuccess: (conversation) => {
      queryClient.setQueryData(
        tripKeys.assistantConversations(tripId),
        (current: typeof conversationsQuery.data) => [
          conversation,
          ...(current ?? []),
        ],
      );
      setSelectedId(conversation.id);
    },
  });
  const deleteMutation = useMutation({
    mutationFn: (conversationId: string) =>
      assistantApi.deleteConversation(tripId, conversationId),
    onSuccess: (_result, conversationId) => {
      const remaining = (conversationsQuery.data ?? []).filter(
        ({ id }) => id !== conversationId,
      );
      queryClient.setQueryData(
        tripKeys.assistantConversations(tripId),
        remaining,
      );
      queryClient.removeQueries({
        queryKey: tripKeys.assistantConversation(tripId, conversationId),
      });
      setSelectedId(remaining[0]?.id);
    },
  });
  const proposalMutation = useMutation({
    mutationFn: ({ action, proposalId }: { action: "apply" | "dismiss"; proposalId: string }) =>
      action === "apply"
        ? assistantApi.applyProposal(tripId, proposalId)
        : assistantApi.dismissProposal(tripId, proposalId),
    onSuccess: (proposal, variables) => {
      if (activeId) {
        queryClient.setQueryData<AiConversationDetail>(
          tripKeys.assistantConversation(tripId, activeId),
          (current) => current && replaceProposal(current, proposal),
        );
      }
      if (variables.action === "apply") {
        void queryClient.invalidateQueries({ queryKey: tripKeys.itinerary(tripId) });
      }
    },
  });

  async function send(event?: FormEvent): Promise<void> {
    event?.preventDefault();
    const content = message.trim();
    if (!activeId || !conversationQuery.data || !content || isStreaming) return;
    const abort = new AbortController();
    abortRef.current = abort;
    setMessage("");
    setPendingUserMessage(content);
    setStreamedText("");
    setStreamError(undefined);
    setToolStatus(undefined);
    setCompletionAnnouncement("");
    streamOutcomeRef.current = undefined;
    setIsStreaming(true);
    try {
      await assistantApi.streamTurn(tripId, activeId, content, {
        onEvent: handleStreamEvent,
        signal: abort.signal,
      });
    } catch (error) {
      if (!abort.signal.aborted) setStreamError(errorMessage(error));
    } finally {
      if (abort.signal.aborted || streamOutcomeRef.current === "error") {
        setPendingUserMessage(undefined);
        setStreamedText("");
        void queryClient.invalidateQueries({
          queryKey: tripKeys.assistantConversation(tripId, activeId),
        });
        void queryClient.invalidateQueries({
          queryKey: tripKeys.assistantConversations(tripId),
        });
      }
      setIsStreaming(false);
      setToolStatus(undefined);
      abortRef.current = null;
    }
  }

  function handleStreamEvent(event: AiSseEvent): void {
    if (event.type === "assistant.delta") {
      setStreamedText((current) => current + event.delta);
      return;
    }
    if (event.type === "assistant.tool") {
      setToolStatus(event.status);
      return;
    }
    if (event.type === "assistant.error") {
      streamOutcomeRef.current = "error";
      setStreamError(event.message);
      return;
    }
    if (event.type === "assistant.completed" && activeId) {
      streamOutcomeRef.current = "completed";
      queryClient.setQueryData<AiConversationDetail>(
        tripKeys.assistantConversation(tripId, activeId),
        (current) => current && appendTurn(current, event.turn),
      );
      void queryClient.invalidateQueries({
        exact: true,
        queryKey: tripKeys.assistantConversations(tripId),
      });
      setPendingUserMessage(undefined);
      setStreamedText("");
      setCompletionAnnouncement("Assistant response complete.");
    }
  }

  const canApply = tripQuery.data?.accessRole !== "viewer";
  const mutationError =
    createMutation.error ?? deleteMutation.error ?? proposalMutation.error;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Trip Assistant</h1>
          <p className="mt-2 text-[var(--muted-foreground)]">
            Ask about this trip or create a suggestion for you to review. Live web information is not available.
          </p>
        </div>
        <Button
          disabled={createMutation.isPending || isStreaming}
          onClick={() => createMutation.mutate()}
        >
          New chat
        </Button>
      </header>

      {conversationsQuery.error ? (
        <Alert>{errorMessage(conversationsQuery.error)}</Alert>
      ) : null}
      {mutationError ? <Alert>{errorMessage(mutationError)}</Alert> : null}

      <div className="grid min-w-0 gap-5 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <Card className="hidden min-w-0 lg:block">
          <CardHeader><CardTitle as="h2">Conversations</CardTitle></CardHeader>
          <CardContent>
            <ConversationList
              conversations={conversations}
              selectedId={activeId}
              onSelect={setSelectedId}
            />
          </CardContent>
        </Card>

        <div className="min-w-0 space-y-3 lg:hidden">
          <Label htmlFor="assistant-conversation">Conversation</Label>
          <select
            id="assistant-conversation"
            className="min-h-11 w-full min-w-0 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-3"
            value={activeId ?? ""}
            onChange={(event) => setSelectedId(event.target.value || undefined)}
          >
            <option value="">Select a conversation</option>
            {conversations.map((conversation) => (
              <option key={conversation.id} value={conversation.id}>{conversation.title}</option>
            ))}
          </select>
        </div>

        <Card className="min-w-0">
          <CardHeader className="flex-row items-center justify-between gap-3">
            <CardTitle as="h2" className="min-w-0 truncate">
              {conversationQuery.data?.title ?? "New conversation"}
            </CardTitle>
            {activeId && conversationQuery.data ? (
              <Button
                aria-label="Delete conversation"
                disabled={deleteMutation.isPending || isStreaming}
                size="sm"
                variant="ghost"
                onClick={() => {
                  if (window.confirm("Delete this private assistant conversation?")) {
                    deleteMutation.mutate(activeId);
                  }
                }}
              >
                Delete
              </Button>
            ) : null}
          </CardHeader>
          <CardContent className="min-w-0 space-y-5">
            {!activeId ? (
              <EmptyState onCreate={() => createMutation.mutate()} />
            ) : conversationQuery.isPending ? (
              <p role="status">Loading conversation…</p>
            ) : conversationQuery.error ? (
              <Alert>{errorMessage(conversationQuery.error)}</Alert>
            ) : (
              <div aria-busy={isStreaming} className="min-w-0 space-y-4">
                {(conversationQuery.data?.turns ?? []).map((turn) => (
                  <TurnView
                    key={turn.id}
                    canApply={canApply}
                    days={daysQuery.data ?? []}
                    items={itineraryQuery.data ?? []}
                    pendingProposalId={proposalMutation.variables?.proposalId}
                    turn={turn}
                    onProposal={(proposalId, action) =>
                      proposalMutation.mutate({ action, proposalId })
                    }
                  />
                ))}
                {pendingUserMessage ? <Message role="user" text={pendingUserMessage} /> : null}
                {streamedText ? <Message role="assistant" text={streamedText} /> : null}
                {toolStatus ? <p className="text-sm text-[var(--muted-foreground)]">{toolStatus}</p> : null}
                {streamError ? <Alert>{streamError}</Alert> : null}
                <span className="sr-only" role="status">{completionAnnouncement}</span>
              </div>
            )}

            {activeId ? (
              <form className="space-y-3 border-t border-[var(--border)] pt-5" onSubmit={(event) => void send(event)}>
                <Label htmlFor="assistant-message">Message</Label>
                <Textarea
                  id="assistant-message"
                  disabled={isStreaming}
                  maxLength={4000}
                  placeholder="What do we have planned for Day 3?"
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  onKeyDown={(event: KeyboardEvent<HTMLTextAreaElement>) => {
                    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                      event.preventDefault();
                      void send();
                    }
                  }}
                />
                <div className="flex flex-wrap justify-between gap-3">
                  <p className="text-xs text-[var(--muted-foreground)]">Cmd+Enter or Ctrl+Enter to send</p>
                  {isStreaming ? (
                    <Button variant="secondary" onClick={() => abortRef.current?.abort()}>Stop</Button>
                  ) : (
                    <Button disabled={!message.trim()} type="submit">Send</Button>
                  )}
                </div>
              </form>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ConversationList({ conversations, selectedId, onSelect }: Readonly<{
  conversations: Array<{ id: string; title: string }>;
  selectedId?: string;
  onSelect(id: string): void;
}>) {
  if (conversations.length === 0) return <p className="text-sm text-[var(--muted-foreground)]">No conversations yet.</p>;
  return (
    <nav aria-label="Assistant conversations">
      <ul className="space-y-2">
        {conversations.map((conversation) => (
          <li key={conversation.id}>
            <Button
              aria-current={selectedId === conversation.id ? "page" : undefined}
              className="w-full min-w-0 justify-start truncate"
              size="sm"
              variant={selectedId === conversation.id ? "secondary" : "ghost"}
              onClick={() => onSelect(conversation.id)}
            >
              <span className="truncate">{conversation.title}</span>
            </Button>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function EmptyState({ onCreate }: Readonly<{ onCreate(): void }>) {
  return (
    <div className="space-y-4 py-8 text-center">
      <p className="font-semibold">Plan with your private Trip Assistant.</p>
      <p className="text-sm text-[var(--muted-foreground)]">
        Try “Which day is busiest?”, “Summarize our reservations”, or “Find everything related to Kyoto.”
      </p>
      <Button onClick={onCreate}>New chat</Button>
    </div>
  );
}

function TurnView({ turn, ...proposalProps }: Readonly<{
  turn: AiTurn;
  canApply: boolean;
  days: TripDay[];
  items: ItineraryItem[];
  pendingProposalId?: string;
  onProposal(id: string, action: "apply" | "dismiss"): void;
}>) {
  return (
    <div className="space-y-3">
      <Message role="user" text={turn.userContent} />
      {turn.status === "completed" && turn.assistantContent ? (
        <Message role="assistant" text={turn.assistantContent} />
      ) : null}
      {turn.status === "failed" ? (
        <Alert>This response failed. You can submit the message again.</Alert>
      ) : null}
      {turn.proposals.map((proposal) => (
        <ProposalCard key={proposal.id} proposal={proposal} {...proposalProps} />
      ))}
    </div>
  );
}

function Message({ role, text }: Readonly<{ role: "assistant" | "user"; text: string }>) {
  return (
    <div className={role === "user" ? "ml-auto max-w-[85%] rounded-[var(--radius-lg)] bg-[var(--primary)] p-4 text-[var(--primary-foreground)]" : "max-w-[90%] rounded-[var(--radius-lg)] bg-[var(--surface-muted)] p-4"}>
      <p className="whitespace-pre-wrap break-words text-sm leading-6">{text}</p>
    </div>
  );
}

function ProposalCard({ proposal, canApply, days, items, pendingProposalId, onProposal }: Readonly<{
  proposal: AiProposal;
  canApply: boolean;
  days: TripDay[];
  items: ItineraryItem[];
  pendingProposalId?: string;
  onProposal(id: string, action: "apply" | "dismiss"): void;
}>) {
  const rows = proposalRows(proposal, days, items);
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-4">
      <p className="font-semibold">{proposalTitle(proposal)}</p>
      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-[var(--muted-foreground)]">{label}</dt>
            <dd className="break-words font-medium">{value}</dd>
          </div>
        ))}
      </dl>
      {proposal.status === "pending" ? (
        <div className="mt-4 space-y-3">
          {!canApply ? (
            <p className="text-sm text-[var(--muted-foreground)]">
              You can review this suggestion, but your Trip role cannot apply changes.
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={!canApply || pendingProposalId === proposal.id}
              size="sm"
              onClick={() => onProposal(proposal.id, "apply")}
            >Apply</Button>
            <Button
              disabled={pendingProposalId === proposal.id}
              size="sm"
              variant="secondary"
              onClick={() => onProposal(proposal.id, "dismiss")}
            >Dismiss</Button>
          </div>
        </div>
      ) : (
        <p className="mt-4 text-sm font-semibold">
          {proposal.status === "stale" ? "This suggestion no longer matches the current trip." : capitalize(proposal.status)}
        </p>
      )}
    </div>
  );
}

function proposalTitle(proposal: AiProposal): string {
  if (proposal.type === "itinerary_create") return "Add itinerary item";
  if (proposal.type === "itinerary_update") return "Update itinerary item";
  return "Move itinerary item";
}

function proposalRows(proposal: AiProposal, days: TripDay[], items: ItineraryItem[]): Array<[string, string]> {
  const payload = proposal.payload;
  if (payload.type === "itinerary_create") {
    return [
      ["Day", days.find(({ id }) => id === payload.dayId)?.date ?? payload.dayId],
      ["Type", capitalize(payload.kind)],
      ["Title", payload.title],
      ["Time", formatTimeRange(payload.startTime, payload.endTime)],
    ];
  }
  if (payload.type === "itinerary_update") {
    const item = items.find(({ id }) => id === payload.itemId);
    return Object.entries(payload.changes).map(([field, value]) => [
      capitalize(field),
      `${displayValue(item?.[field as keyof ItineraryItem])} → ${displayValue(value)}`,
    ]);
  }
  const item = items.find(({ id }) => id === payload.itemId);
  return [
    ["Item", item?.title ?? payload.itemId],
    ["Current day", days.find(({ id }) => id === item?.dayId)?.date ?? "Unknown"],
    ["Target day", days.find(({ id }) => id === payload.targetDayId)?.date ?? payload.targetDayId],
    ["Target position", String(payload.targetPosition + 1)],
  ];
}

function appendTurn(conversation: AiConversationDetail, turn: AiTurn): AiConversationDetail {
  return { ...conversation, turns: [...conversation.turns.filter(({ id }) => id !== turn.id), turn] };
}

function replaceProposal(conversation: AiConversationDetail, proposal: AiProposal): AiConversationDetail {
  return {
    ...conversation,
    turns: conversation.turns.map((turn) => ({
      ...turn,
      proposals: turn.proposals.map((current) => current.id === proposal.id ? proposal : current),
    })),
  };
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    const messages: Record<string, string> = {
      AI_ASSISTANT_UNAVAILABLE: "The Trip Assistant is not available right now.",
      AI_CONVERSATION_BUSY: "This conversation already has a response in progress.",
      AI_PROVIDER_BUSY: "The assistant provider is busy. Please try again shortly.",
      AI_PROVIDER_UNAVAILABLE: "The assistant provider is unavailable. Please try again.",
      AI_SAFETY_CHECK_UNAVAILABLE: "The assistant safety check is unavailable. Please try again.",
      AI_SAFETY_REJECTED: "This request cannot be processed by the assistant.",
      AI_ASSISTANT_TIMEOUT: "The assistant took too long to respond.",
      AI_CLIENT_DISCONNECTED: "Generation was stopped.",
      TOO_MANY_REQUESTS: "You have reached the assistant request limit. Please try again later.",
    };
    return messages[error.code] ?? error.message;
  }
  return "The assistant request could not be completed.";
}

function formatTimeRange(start: string | null, end: string | null): string {
  return start || end ? `${start ?? "—"} – ${end ?? "—"}` : "No time";
}
function displayValue(value: unknown): string {
  return value === null || value === undefined || value === "" ? "—" : String(value);
}
function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1).replaceAll("_", " ");
}
