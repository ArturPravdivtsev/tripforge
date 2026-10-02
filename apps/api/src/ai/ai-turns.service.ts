import { Inject, Injectable } from "@nestjs/common";
import type { AiProposalPayload, AiSseEvent } from "@tripforge/contracts";
import OpenAI from "openai";
import type { Responses } from "openai/resources/responses/responses";

import { AppLogger } from "../observability/app-logger.service";
import { ObservabilityMetrics } from "../observability/metrics.service";
import { withInternalSpan } from "../observability/tracing";
import { TripPermissionsService } from "../trips/trip-permissions.service";
import {
  AI_MAX_TOOL_CALLS,
  AI_MAX_TOOL_ROUNDS,
  AI_MODEL_CLIENT,
  AI_PUBLIC_ERRORS,
  type AiPublicErrorCode,
} from "./ai.constants";
import { conversationNotFound } from "./ai-conversations.service";
import {
  AiModelClient,
  isOpenAiFunctionCall,
  type AiModelCompleted,
  type AiModelUsage,
} from "./ai-model-client";
import { AiRepository } from "./ai.repository";
import { AI_TOOLS, AiToolRegistry } from "./ai-tool-registry";
import { AiProviderConfigurationError } from "./openai-client.service";

type EmitEvent = (event: AiSseEvent) => void;

@Injectable()
export class AiTurnsService {
  constructor(
    @Inject(AI_MODEL_CLIENT) private readonly model: AiModelClient,
    private readonly repository: AiRepository,
    private readonly tools: AiToolRegistry,
    private readonly permissions: TripPermissionsService,
    private readonly metrics: ObservabilityMetrics,
    private readonly logger: AppLogger,
  ) {}

  async run(
    userId: string,
    tripId: string,
    conversationId: string,
    message: string,
    signal: AbortSignal,
    emit: EmitEvent,
  ): Promise<void> {
    await this.permissions.requireReadable(userId, tripId);
    if (!(await this.repository.owned(tripId, userId, conversationId))) {
      throw conversationNotFound();
    }

    let turnId: string | undefined;
    const startedAt = process.hrtime.bigint();
    try {
      let rejected: boolean;
      try {
        rejected = await this.model.moderate(message, signal);
      } catch (error) {
        if (error instanceof AiProviderConfigurationError) throw error;
        const code = signal.aborted
          ? mapProviderError(error, signal)
          : "AI_SAFETY_CHECK_UNAVAILABLE";
        emitError(emit, code);
        this.metrics.aiTurn(
          "unknown",
          code === "AI_SAFETY_CHECK_UNAVAILABLE" ? "safety_unavailable" : "failed",
          secondsSince(startedAt),
        );
        return;
      }
      if (rejected) {
        emitError(emit, "AI_SAFETY_REJECTED");
        this.metrics.aiTurn("unknown", "safety_rejected", secondsSince(startedAt));
        return;
      }

      let turn: { id: string } | undefined;
      try {
        turn = await this.repository.startTurn(
          tripId,
          userId,
          conversationId,
          message,
        );
      } catch (error) {
        if (postgresCode(error) === "23505") {
          emit({
            code: "AI_CONVERSATION_BUSY",
            message: "This conversation already has a response in progress.",
            type: "assistant.error",
          });
          return;
        }
        throw error;
      }
      if (!turn) throw conversationNotFound();
      turnId = turn.id;
      emit({ turnId, type: "assistant.ready" });

      const history = await this.repository.history(conversationId);
      let input: Responses.ResponseInput = [
        ...history.map(({ content, role }) => ({ content, role })),
        { content: message, role: "user" },
      ];
      const drafts: AiProposalPayload[] = [];
      let assistantContent = "";
      let model = "unknown";
      let usage = emptyUsage();
      let toolCalls = 0;

      for (let round = 0; round < AI_MAX_TOOL_ROUNDS; round += 1) {
        let completed: AiModelCompleted | undefined;
        for await (const event of this.model.generate(input, AI_TOOLS, signal)) {
          if (event.type === "text") {
            assistantContent += event.delta;
            emit({ delta: event.delta, type: "assistant.delta" });
          } else {
            completed = event;
            model = event.model;
            usage = addUsage(usage, event.usage);
          }
        }
        if (!completed) throw new Error("Provider stream ended without completion");
        const calls = completed.output.filter(isOpenAiFunctionCall);
        if (calls.length === 0) {
          const persisted = await this.repository.completeTurn(
            turnId,
            assistantContent.trim() || "I couldn't complete that request.",
            model,
            usage,
            drafts.map((payload) => ({ payload })),
          );
          this.metrics.aiTurn(model, "completed", secondsSince(startedAt));
          this.metrics.aiTokens(model, usage);
          for (const draft of drafts) {
            this.metrics.aiProposal(draft.type, "generated");
          }
          emit({ turn: persisted, type: "assistant.completed" });
          this.logger.event("info", "ai.turn.completed", {
            model,
            proposalCount: drafts.length,
            toolCallCount: toolCalls,
          });
          return;
        }
        toolCalls += calls.length;
        if (toolCalls > AI_MAX_TOOL_CALLS || round + 1 >= AI_MAX_TOOL_ROUNDS) {
          await this.repository.failTurn(turnId, "AI_TOOL_LIMIT_REACHED");
          emitError(emit, "AI_TOOL_LIMIT_REACHED");
          this.metrics.aiTurn(model, "tool_limit", secondsSince(startedAt));
          return;
        }
        const outputs: Responses.ResponseInputItem.FunctionCallOutput[] = [];
        for (const call of calls) {
          let output: string;
          const safeToolName = AI_TOOLS.some(({ name }) => name === call.name)
            ? call.name
            : "unknown";
          try {
            const execution = await withInternalSpan(
              `ai.tool.${safeToolName}`,
              { "ai.tool.name": safeToolName },
              () => this.tools.execute(call.name, call.arguments, { tripId, userId }),
            );
            output = execution.output;
            if (execution.proposal) drafts.push(execution.proposal);
            emit({ status: execution.status, type: "assistant.tool" });
            this.metrics.aiTool(safeToolName, "success");
          } catch {
            output = JSON.stringify({ error: "TOOL_REQUEST_REJECTED", ok: false });
            this.metrics.aiTool(safeToolName, "failure");
            this.logger.event("warn", "ai.tool.failed", { toolName: safeToolName });
          }
          outputs.push({ call_id: call.call_id, output, type: "function_call_output" });
        }
        input = [
          ...input,
          ...completed.output,
          ...outputs,
        ] as Responses.ResponseInput;
      }
    } catch (error) {
      const code = mapProviderError(error, signal);
      if (turnId) await this.repository.failTurn(turnId, code).catch(() => undefined);
      emitError(emit, code);
      this.metrics.aiTurn("unknown", "failed", secondsSince(startedAt));
      this.logger.event("warn", "ai.turn.failed", { errorCode: code });
    }
  }
}

function emitError(emit: EmitEvent, code: AiPublicErrorCode): void {
  emit({ code, message: AI_PUBLIC_ERRORS[code], type: "assistant.error" });
}

function emptyUsage(): AiModelUsage {
  return { cachedInputTokens: 0, inputTokens: 0, outputTokens: 0, reasoningTokens: 0 };
}

function addUsage(left: AiModelUsage, right: AiModelUsage): AiModelUsage {
  return {
    cachedInputTokens: left.cachedInputTokens + right.cachedInputTokens,
    inputTokens: left.inputTokens + right.inputTokens,
    outputTokens: left.outputTokens + right.outputTokens,
    reasoningTokens: left.reasoningTokens + right.reasoningTokens,
  };
}

function mapProviderError(error: unknown, signal: AbortSignal): AiPublicErrorCode {
  if (signal.aborted) {
    return signal.reason === "client-disconnected"
      ? "AI_CLIENT_DISCONNECTED"
      : "AI_ASSISTANT_TIMEOUT";
  }
  if (error instanceof AiProviderConfigurationError) return "AI_ASSISTANT_UNAVAILABLE";
  if (error instanceof OpenAI.APIError) {
    if (error.status === 429) return "AI_PROVIDER_BUSY";
    if (error.status === 401 || error.status === 403) return "AI_ASSISTANT_UNAVAILABLE";
  }
  return "AI_PROVIDER_UNAVAILABLE";
}

function postgresCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  if ("code" in error && typeof error.code === "string") return error.code;
  const cause = "cause" in error ? error.cause : undefined;
  return cause && typeof cause === "object" && "code" in cause && typeof cause.code === "string"
    ? cause.code
    : undefined;
}

function secondsSince(startedAt: bigint): number {
  return Number(process.hrtime.bigint() - startedAt) / 1_000_000_000;
}
