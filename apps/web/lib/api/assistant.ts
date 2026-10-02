import type {
  AiConversationDetail,
  AiConversationSummary,
  AiProposal,
  AiSseEvent,
} from "@tripforge/contracts";

import { apiFetch } from "./client";
import { getApiBaseUrl } from "./config";
import { ApiClientError } from "./errors";

type StreamHandlers = Readonly<{
  onEvent(event: AiSseEvent): void;
  signal: AbortSignal;
}>;

export const assistantApi = {
  listConversations(
    tripId: string,
    signal?: AbortSignal,
  ): Promise<AiConversationSummary[]> {
    return apiFetch(`/api/trips/${tripId}/assistant/conversations`, { signal });
  },

  createConversation(tripId: string): Promise<AiConversationSummary> {
    return apiFetch(`/api/trips/${tripId}/assistant/conversations`, {
      json: {},
      method: "POST",
    });
  },

  getConversation(
    tripId: string,
    conversationId: string,
    signal?: AbortSignal,
  ): Promise<AiConversationDetail> {
    return apiFetch(
      `/api/trips/${tripId}/assistant/conversations/${conversationId}`,
      { signal },
    );
  },

  deleteConversation(tripId: string, conversationId: string): Promise<void> {
    return apiFetch(
      `/api/trips/${tripId}/assistant/conversations/${conversationId}`,
      { method: "DELETE" },
    );
  },

  applyProposal(tripId: string, proposalId: string): Promise<AiProposal> {
    return apiFetch(
      `/api/trips/${tripId}/assistant/proposals/${proposalId}/apply`,
      { json: {}, method: "POST" },
    );
  },

  dismissProposal(tripId: string, proposalId: string): Promise<AiProposal> {
    return apiFetch(
      `/api/trips/${tripId}/assistant/proposals/${proposalId}/dismiss`,
      { json: {}, method: "POST" },
    );
  },

  async streamTurn(
    tripId: string,
    conversationId: string,
    message: string,
    handlers: StreamHandlers,
  ): Promise<void> {
    const response = await fetch(
      `${getApiBaseUrl()}/api/trips/${tripId}/assistant/conversations/${conversationId}/turns`,
      {
        body: JSON.stringify({ message }),
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-TripForge-Request": "1",
        },
        method: "POST",
        signal: handlers.signal,
      },
    );
    if (!response.ok) {
      const body = await safeJson(response);
      throw new ApiClientError(
        typeof body?.message === "string" ? body.message : "The assistant request failed",
        response.status,
        typeof body?.code === "string" ? body.code : "REQUEST_FAILED",
      );
    }
    if (!response.body) {
      throw new ApiClientError("The assistant stream was unavailable", 502, "INVALID_AI_STREAM");
    }
    await parseAssistantSse(response.body, handlers.onEvent);
  },
};

export async function parseAssistantSse(
  stream: ReadableStream<Uint8Array>,
  onEvent: (event: AiSseEvent) => void,
): Promise<void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const block of parts) {
      const data = block
        .split("\n")
        .filter((line) => line.startsWith("data: "))
        .map((line) => line.slice(6))
        .join("\n");
      if (!data) continue;
      const event = JSON.parse(data) as AiSseEvent;
      if (!isAiSseEvent(event)) throw new Error("Invalid assistant stream event");
      onEvent(event);
    }
    if (done) break;
  }
}

function isAiSseEvent(value: unknown): value is AiSseEvent {
  if (!isRecord(value) || typeof value.type !== "string") return false;
  if (value.type === "assistant.ready") {
    return hasExactKeys(value, ["type", "turnId"]) && typeof value.turnId === "string";
  }
  if (value.type === "assistant.delta") {
    return hasExactKeys(value, ["type", "delta"]) && typeof value.delta === "string";
  }
  if (value.type === "assistant.tool") {
    return hasExactKeys(value, ["type", "status"]) && typeof value.status === "string";
  }
  if (value.type === "assistant.error") {
    return (
      hasExactKeys(value, ["type", "code", "message"]) &&
      typeof value.code === "string" &&
      typeof value.message === "string"
    );
  }
  if (value.type === "assistant.completed") {
    return hasExactKeys(value, ["type", "turn"]) && isAiTurn(value.turn);
  }
  return false;
}

function isAiTurn(value: unknown): value is AiConversationDetail["turns"][number] {
  return (
    isRecord(value) &&
    hasExactKeys(value, [
      "id",
      "status",
      "userContent",
      "assistantContent",
      "model",
      "promptVersion",
      "errorCode",
      "createdAt",
      "completedAt",
      "proposals",
    ]) &&
    typeof value.id === "string" &&
    ["pending", "completed", "failed"].includes(String(value.status)) &&
    typeof value.userContent === "string" &&
    (value.assistantContent === null || typeof value.assistantContent === "string") &&
    (value.model === null || typeof value.model === "string") &&
    typeof value.promptVersion === "string" &&
    (value.errorCode === null || typeof value.errorCode === "string") &&
    typeof value.createdAt === "string" &&
    (value.completedAt === null || typeof value.completedAt === "string") &&
    Array.isArray(value.proposals)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === expected.length && expected.every((key) => keys.includes(key));
}

async function safeJson(response: Response): Promise<Record<string, unknown> | undefined> {
  try {
    const value = (await response.json()) as unknown;
    return value && typeof value === "object" ? (value as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}
