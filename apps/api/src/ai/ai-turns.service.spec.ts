import { describe, expect, it, vi } from "vitest";

import { AppLogger } from "../observability/app-logger.service";
import { ObservabilityMetrics } from "../observability/metrics.service";
import { TripPermissionsService } from "../trips/trip-permissions.service";
import { AiModelClient, type AiModelEvent } from "./ai-model-client";
import { AiRepository } from "./ai.repository";
import { AiToolRegistry } from "./ai-tool-registry";
import { AiTurnsService } from "./ai-turns.service";

const turn = {
  assistantContent: "Your plan is ready.",
  completedAt: "2027-01-01T00:00:01.000Z",
  createdAt: "2027-01-01T00:00:00.000Z",
  errorCode: null,
  id: "33333333-3333-4333-8333-333333333333",
  model: "gpt-6-luna",
  promptVersion: "1",
  proposals: [],
  status: "completed" as const,
  userContent: "Plan this day",
};

function createSubject(events: AiModelEvent[] = [completed()]) {
  const model = {
    generate: vi.fn(() => eventStream(events)),
    moderate: vi.fn().mockResolvedValue(false),
  };
  const repository = {
    completeTurn: vi.fn().mockResolvedValue(turn),
    failTurn: vi.fn().mockResolvedValue(undefined),
    history: vi.fn().mockResolvedValue([]),
    owned: vi.fn().mockResolvedValue({ id: "conversation" }),
    startTurn: vi.fn().mockResolvedValue({ id: turn.id }),
  };
  const tools = {
    execute: vi.fn().mockResolvedValue({
      output: JSON.stringify({ ok: true }),
      status: "Checking your itinerary…",
    }),
  };
  const permissions = { requireReadable: vi.fn().mockResolvedValue({}) };
  const metrics = {
    aiProposal: vi.fn(),
    aiTokens: vi.fn(),
    aiTool: vi.fn(),
    aiTurn: vi.fn(),
  };
  const logger = { event: vi.fn() };
  return {
    logger,
    metrics,
    model,
    permissions,
    repository,
    service: new AiTurnsService(
      model as unknown as AiModelClient,
      repository as unknown as AiRepository,
      tools as unknown as AiToolRegistry,
      permissions as unknown as TripPermissionsService,
      metrics as unknown as ObservabilityMetrics,
      logger as unknown as AppLogger,
    ),
    tools,
  };
}

describe("AiTurnsService", () => {
  it("rejects flagged input before persisting or generating", async () => {
    const subject = createSubject();
    subject.model.moderate.mockResolvedValue(true);
    const events = vi.fn();

    await subject.service.run("user", "trip", "conversation", "unsafe", new AbortController().signal, events);

    expect(subject.repository.startTurn).not.toHaveBeenCalled();
    expect(subject.model.generate).not.toHaveBeenCalled();
    expect(events).toHaveBeenCalledWith(expect.objectContaining({ code: "AI_SAFETY_REJECTED" }));
  });

  it("fails closed when moderation is unavailable", async () => {
    const subject = createSubject();
    subject.model.moderate.mockRejectedValue(new Error("provider detail"));
    const events = vi.fn();

    await subject.service.run("user", "trip", "conversation", "hello", new AbortController().signal, events);

    expect(subject.repository.startTurn).not.toHaveBeenCalled();
    expect(subject.model.generate).not.toHaveBeenCalled();
    expect(events).toHaveBeenCalledWith(expect.objectContaining({ code: "AI_SAFETY_CHECK_UNAVAILABLE" }));
  });

  it("streams text, executes a bounded tool, and atomically completes with proposal drafts", async () => {
    const call = {
      arguments: JSON.stringify({}),
      call_id: "call-1",
      name: "get_trip_overview",
      type: "function_call" as const,
    };
    const proposal = {
      dayId: "11111111-1111-4111-8111-111111111111",
      endTime: null,
      kind: "activity" as const,
      notes: null,
      startTime: "09:00",
      title: "Museum",
      type: "itinerary_create" as const,
    };
    const subject = createSubject();
    subject.model.generate
      .mockImplementationOnce(() => eventStream([completed([call])]))
      .mockImplementationOnce(() => eventStream([
        { delta: "Your plan is ready.", type: "text" },
        completed([], { cachedInputTokens: 2, inputTokens: 10, outputTokens: 4, reasoningTokens: 1 }),
      ]));
    subject.tools.execute.mockResolvedValue({
      output: JSON.stringify({ ok: true, proposalDrafted: true }),
      proposal,
      status: "Drafting an itinerary addition…",
    });
    const events = vi.fn();

    await subject.service.run("user", "trip", "conversation", "Plan this day", new AbortController().signal, events);

    expect(subject.tools.execute).toHaveBeenCalledWith(
      "get_trip_overview",
      JSON.stringify({}),
      { tripId: "trip", userId: "user" },
    );
    expect(subject.repository.completeTurn).toHaveBeenCalledWith(
      turn.id,
      "Your plan is ready.",
      "gpt-6-luna",
      { cachedInputTokens: 2, inputTokens: 10, outputTokens: 4, reasoningTokens: 1 },
      [{ payload: proposal }],
    );
    expect(events).toHaveBeenCalledWith({ delta: "Your plan is ready.", type: "assistant.delta" });
    expect(events).toHaveBeenCalledWith({ turn, type: "assistant.completed" });
  });

  it("marks a started turn failed without persisting drafts on provider failure", async () => {
    const subject = createSubject();
    subject.model.generate.mockImplementation(() => failingStream());
    const events = vi.fn();

    await subject.service.run("user", "trip", "conversation", "hello", new AbortController().signal, events);

    expect(subject.repository.failTurn).toHaveBeenCalledWith(turn.id, "AI_PROVIDER_UNAVAILABLE");
    expect(subject.repository.completeTurn).not.toHaveBeenCalled();
    expect(events).toHaveBeenCalledWith(expect.objectContaining({ code: "AI_PROVIDER_UNAVAILABLE" }));
  });

  it("stops repeated tool calls at the configured round bound", async () => {
    const call = {
      arguments: "{}",
      call_id: "call-loop",
      name: "get_trip_overview",
      type: "function_call" as const,
    };
    const subject = createSubject();
    subject.model.generate.mockImplementation(() => eventStream([completed([call])]));
    const events = vi.fn();

    await subject.service.run("user", "trip", "conversation", "loop", new AbortController().signal, events);

    expect(subject.model.generate).toHaveBeenCalledTimes(4);
    expect(subject.tools.execute).toHaveBeenCalledTimes(3);
    expect(subject.repository.failTurn).toHaveBeenCalledWith(turn.id, "AI_TOOL_LIMIT_REACHED");
  });

  it("maps an aborted provider request to a safe timeout and failed turn", async () => {
    const subject = createSubject();
    const abort = new AbortController();
    abort.abort("timeout");
    subject.model.generate.mockImplementation(() => failingStream());
    const events = vi.fn();

    await subject.service.run("user", "trip", "conversation", "hello", abort.signal, events);

    expect(subject.repository.failTurn).toHaveBeenCalledWith(turn.id, "AI_ASSISTANT_TIMEOUT");
    expect(events).toHaveBeenCalledWith(expect.objectContaining({ code: "AI_ASSISTANT_TIMEOUT" }));
  });

  it("maps a client disconnect to a safe failed turn", async () => {
    const subject = createSubject();
    const abort = new AbortController();
    abort.abort("client-disconnected");
    subject.model.generate.mockImplementation(() => failingStream());
    const events = vi.fn();

    await subject.service.run("user", "trip", "conversation", "hello", abort.signal, events);

    expect(subject.repository.failTurn).toHaveBeenCalledWith(turn.id, "AI_CLIENT_DISCONNECTED");
    expect(events).toHaveBeenCalledWith(expect.objectContaining({ code: "AI_CLIENT_DISCONNECTED" }));
  });

  it("returns a stable busy event for the pending-turn uniqueness constraint", async () => {
    const subject = createSubject();
    subject.repository.startTurn.mockRejectedValue({ code: "23505" });
    const events = vi.fn();

    await subject.service.run("user", "trip", "conversation", "hello", new AbortController().signal, events);

    expect(subject.model.generate).not.toHaveBeenCalled();
    expect(events).toHaveBeenCalledWith(expect.objectContaining({ code: "AI_CONVERSATION_BUSY" }));
  });
});

function completed(
  output: unknown[] = [],
  usage = { cachedInputTokens: 0, inputTokens: 0, outputTokens: 0, reasoningTokens: 0 },
): AiModelEvent {
  return {
    model: "gpt-6-luna",
    output: output as never,
    type: "completed",
    usage,
  };
}

async function* eventStream(events: AiModelEvent[]): AsyncGenerator<AiModelEvent> {
  for (const event of events) yield event;
}

async function* failingStream(): AsyncGenerator<AiModelEvent> {
  yield* [] as AiModelEvent[];
  throw new Error("raw provider failure");
}
