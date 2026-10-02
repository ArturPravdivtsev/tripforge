export const AI_MODEL_CLIENT = Symbol("AI_MODEL_CLIENT");
export const TRIP_ASSISTANT_PROMPT_VERSION = "1";
export const AI_MAX_TOOL_CALLS = 8;
export const AI_MAX_TOOL_ROUNDS = 4;
export const AI_HISTORY_TURNS = 12;
export const AI_HISTORY_CHARACTER_BUDGET = 24_000;
export const AI_PENDING_STALE_MS = 120_000;

export const AI_PUBLIC_ERRORS = {
  AI_ASSISTANT_TIMEOUT: "The assistant took too long to respond. Please try again.",
  AI_ASSISTANT_UNAVAILABLE: "The assistant is not available right now.",
  AI_CLIENT_DISCONNECTED: "Generation was stopped.",
  AI_PROVIDER_BUSY: "The assistant provider is busy. Please try again shortly.",
  AI_PROVIDER_UNAVAILABLE: "The assistant provider is unavailable. Please try again.",
  AI_SAFETY_CHECK_UNAVAILABLE: "The safety check is unavailable. Please try again.",
  AI_SAFETY_REJECTED: "This request cannot be processed by the assistant.",
  AI_TOOL_LIMIT_REACHED: "I couldn't gather enough information to complete that request.",
} as const;

export type AiPublicErrorCode = keyof typeof AI_PUBLIC_ERRORS;
