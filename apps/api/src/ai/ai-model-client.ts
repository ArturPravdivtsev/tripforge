import type OpenAI from "openai";
import type { Responses } from "openai/resources/responses/responses";

export type AiModelInput = Responses.ResponseInput;
export type AiModelTool = Responses.Tool;

export type AiModelUsage = Readonly<{
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
}>;

export type AiModelCompleted = Readonly<{
  type: "completed";
  model: string;
  output: Responses.ResponseOutputItem[];
  usage: AiModelUsage;
}>;

export type AiModelEvent =
  | Readonly<{ type: "text"; delta: string }>
  | AiModelCompleted;

export abstract class AiModelClient {
  abstract moderate(input: string, signal: AbortSignal): Promise<boolean>;

  abstract generate(
    input: AiModelInput,
    tools: AiModelTool[],
    signal: AbortSignal,
  ): AsyncGenerator<AiModelEvent>;
}

export function isOpenAiFunctionCall(
  item: Responses.ResponseOutputItem,
): item is Responses.ResponseFunctionToolCall {
  return item.type === "function_call";
}

export type OpenAiClient = OpenAI;
