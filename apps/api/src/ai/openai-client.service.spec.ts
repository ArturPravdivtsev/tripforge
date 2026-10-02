import { ConfigService } from "@nestjs/config";
import { describe, expect, it } from "vitest";

import { AI_TOOLS } from "./ai-tool-registry";
import {
  AiProviderConfigurationError,
  buildResponseRequest,
  OpenAiClientService,
} from "./openai-client.service";

describe("OpenAiClientService", () => {
  it("builds a streaming Responses request with application-owned state", () => {
    const request = buildResponseRequest(
      [{ content: "Hello", role: "user" }],
      AI_TOOLS,
      "gpt-6-luna",
      "medium",
      1_500,
    );

    expect(request).toMatchObject({
      max_output_tokens: 1_500,
      model: "gpt-6-luna",
      reasoning: { effort: "medium" },
      store: false,
      stream: true,
      tools: AI_TOOLS,
    });
    expect(request).not.toHaveProperty("previous_response_id");
    expect(request).not.toHaveProperty("conversation");
  });

  it("stays unavailable without a server API key and never falls back silently", async () => {
    const config = new ConfigService({ AI_ASSISTANT_ENABLED: true });
    const client = new OpenAiClientService(config);

    expect(client.available).toBe(false);
    await expect(client.moderate("Hello", new AbortController().signal)).rejects.toBeInstanceOf(
      AiProviderConfigurationError,
    );
  });
});
