import process from "node:process";

import OpenAI from "openai";

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  process.stderr.write("OPENAI_API_KEY is required for the optional live AI eval.\n");
  process.exitCode = 2;
} else {
  const client = new OpenAI({ apiKey, maxRetries: 0, timeout: 45_000 });
  const stream = await client.responses.create({
    input: "Reply with a short acknowledgement, then call the supplied tool.",
    max_output_tokens: 128,
    model: process.env.OPENAI_MODEL || "gpt-6-luna",
    reasoning: { effort: process.env.OPENAI_REASONING_EFFORT || "medium" },
    store: false,
    stream: true,
    tools: [{
      description: "Return deterministic smoke-test data.",
      name: "get_trip_overview",
      parameters: { additionalProperties: false, properties: {}, required: [], type: "object" },
      strict: true,
      type: "function",
    }],
  });
  let completed = false;
  let sawTool = false;
  for await (const event of stream) {
    if (event.type === "response.output_item.done" && event.item.type === "function_call") sawTool = true;
    if (event.type === "response.completed") completed = true;
  }
  if (!completed || !sawTool) throw new Error("Live AI smoke did not complete the expected tool call");
  process.stdout.write("Live AI Responses streaming/tool smoke passed with store=false.\n");
}
