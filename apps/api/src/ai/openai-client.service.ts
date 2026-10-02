import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import OpenAI from "openai";
import type { Responses } from "openai/resources/responses/responses";

import {
  AiModelClient,
  type AiModelEvent,
  type AiModelInput,
  type AiModelTool,
} from "./ai-model-client";
import { TRIP_ASSISTANT_INSTRUCTIONS } from "./ai-prompt";

@Injectable()
export class OpenAiClientService extends AiModelClient {
  private readonly client: OpenAI | undefined;
  private readonly maxOutputTokens: number;
  private readonly model: string;
  private readonly reasoningEffort:
    | "none"
    | "low"
    | "medium"
    | "high"
    | "xhigh"
    | "max";

  constructor(config: ConfigService) {
    super();
    const apiKey = config.get<string>("OPENAI_API_KEY");
    const enabled = config.get<boolean>("AI_ASSISTANT_ENABLED") ?? false;
    const timeout = config.get<number>("OPENAI_TIMEOUT_MS") ?? 45_000;
    this.maxOutputTokens =
      config.get<number>("OPENAI_MAX_OUTPUT_TOKENS") ?? 1_500;
    this.model = config.get<string>("OPENAI_MODEL") ?? "gpt-6-luna";
    this.reasoningEffort =
      config.get<typeof this.reasoningEffort>("OPENAI_REASONING_EFFORT") ??
      "medium";
    this.client =
      enabled && apiKey
        ? new OpenAI({ apiKey, maxRetries: 1, timeout })
        : undefined;
  }

  get available(): boolean {
    return Boolean(this.client);
  }

  async moderate(input: string, signal: AbortSignal): Promise<boolean> {
    if (!this.client) throw new AiProviderConfigurationError();
    const result = await this.client.moderations.create(
      { input, model: "omni-moderation-latest" },
      { signal },
    );
    return result.results.some(({ flagged }) => flagged);
  }

  async *generate(
    input: AiModelInput,
    tools: AiModelTool[],
    signal: AbortSignal,
  ): AsyncGenerator<AiModelEvent> {
    if (!this.client) throw new AiProviderConfigurationError();
    const stream = await this.client.responses.create(
      buildResponseRequest(
        input,
        tools,
        this.model,
        this.reasoningEffort,
        this.maxOutputTokens,
      ),
      { signal },
    );

    for await (const event of stream) {
      if (event.type === "response.output_text.delta") {
        yield { delta: event.delta, type: "text" };
      }
      if (event.type === "response.completed") {
        const usage = event.response.usage;
        yield {
          model: event.response.model,
          output: event.response.output,
          type: "completed",
          usage: {
            cachedInputTokens: usage?.input_tokens_details.cached_tokens ?? 0,
            inputTokens: usage?.input_tokens ?? 0,
            outputTokens: usage?.output_tokens ?? 0,
            reasoningTokens: usage?.output_tokens_details.reasoning_tokens ?? 0,
          },
        };
      }
      if (event.type === "response.failed") {
        throw new AiProviderResponseError();
      }
      if (event.type === "response.incomplete") {
        throw new AiProviderResponseError();
      }
    }
  }
}

export class AiProviderConfigurationError extends Error {}
export class AiProviderResponseError extends Error {}

export function buildResponseRequest(
  input: AiModelInput,
  tools: AiModelTool[],
  model: string,
  reasoningEffort: "none" | "low" | "medium" | "high" | "xhigh" | "max",
  maxOutputTokens: number,
): Responses.ResponseCreateParamsStreaming {
  return {
    input,
    instructions: TRIP_ASSISTANT_INSTRUCTIONS,
    max_output_tokens: maxOutputTokens,
    model,
    reasoning: { effort: reasoningEffort },
    store: false,
    stream: true,
    tools,
  };
}
