import { describe, expect, it } from "vitest";

import { parseAssistantSse } from "./assistant";

describe("parseAssistantSse", () => {
  it("handles split chunks, multiple events, and UTF-8 text", async () => {
    const source = [
      'event: assistant.delta\ndata: {"type":"assistant.delta","delta":"Ки',
      'ото"}\n\nevent: assistant.tool\ndata: {"type":"assistant.tool","status":"Checking…"}\n\n',
    ];
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of source) controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    });
    const events: unknown[] = [];
    await parseAssistantSse(stream, (event) => events.push(event));
    expect(events).toEqual([
      { delta: "Киото", type: "assistant.delta" },
      { status: "Checking…", type: "assistant.tool" },
    ]);
  });

  it("accepts completed and safe error events", async () => {
    const turn = {
      assistantContent: "Done",
      completedAt: "2026-10-02T00:00:01.000Z",
      createdAt: "2026-10-02T00:00:00.000Z",
      errorCode: null,
      id: "turn-1",
      model: "gpt-6-luna",
      promptVersion: "1",
      proposals: [],
      status: "completed",
      userContent: "Plan Day 3",
    };
    const body = [
      `event: assistant.completed\ndata: ${JSON.stringify({ type: "assistant.completed", turn })}`,
      "",
      'event: assistant.error\ndata: {"type":"assistant.error","code":"AI_PROVIDER_BUSY","message":"Busy"}',
      "",
      "",
    ].join("\n");
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(body));
        controller.close();
      },
    });
    const events: unknown[] = [];
    await parseAssistantSse(stream, (event) => events.push(event));
    expect(events).toEqual([
      { type: "assistant.completed", turn },
      { code: "AI_PROVIDER_BUSY", message: "Busy", type: "assistant.error" },
    ]);
  });

  it("rejects raw or augmented provider events", async () => {
    const body = [
      'data: {"type":"assistant.delta","delta":"Safe text","response":{"output":[]}}',
      "",
      "",
    ].join("\n");
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(body));
        controller.close();
      },
    });

    await expect(parseAssistantSse(stream, () => undefined)).rejects.toThrow(
      "Invalid assistant stream event",
    );
  });
});
