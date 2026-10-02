import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AiConversationDetail, Trip } from "@tripforge/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { assistantApi } from "@/lib/api/assistant";
import { tripsApi } from "@/lib/api/trips";
import { expectNoAxeViolations } from "@/test/accessibility";
import { renderWithQueryClient } from "@/test-utils";

import { AssistantScreen } from "./assistant-screen";

const trip: Trip = {
  accessRole: "viewer",
  createdAt: "2027-01-01T00:00:00.000Z",
  endsOn: "2027-04-16",
  id: "11111111-1111-4111-8111-111111111111",
  name: "Japan",
  startsOn: "2027-04-12",
  updatedAt: "2027-01-01T00:00:00.000Z",
};

const conversation: AiConversationDetail = {
  createdAt: "2027-01-01T00:00:00.000Z",
  id: "22222222-2222-4222-8222-222222222222",
  title: "Move the temple",
  turns: [
    {
      assistantContent: "I prepared a move for review.",
      completedAt: "2027-01-01T00:00:01.000Z",
      createdAt: "2027-01-01T00:00:00.000Z",
      errorCode: null,
      id: "33333333-3333-4333-8333-333333333333",
      model: "gpt-6-luna",
      promptVersion: "1",
      proposals: [
        {
          appliedAt: null,
          createdAt: "2027-01-01T00:00:01.000Z",
          dismissedAt: null,
          id: "44444444-4444-4444-8444-444444444444",
          payload: {
            itemId: "55555555-5555-4555-8555-555555555555",
            targetDayId: "66666666-6666-4666-8666-666666666666",
            targetPosition: 0,
            type: "itinerary_move",
          },
          status: "pending",
          type: "itinerary_move",
        },
      ],
      status: "completed",
      userContent: "Move the temple to tomorrow.",
    },
  ],
  updatedAt: "2027-01-01T00:00:01.000Z",
};

describe("AssistantScreen", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(assistantApi, "listConversations").mockResolvedValue([conversation]);
    vi.spyOn(assistantApi, "getConversation").mockResolvedValue(conversation);
    vi.spyOn(tripsApi, "get").mockResolvedValue(trip);
    vi.spyOn(tripsApi, "listDays").mockResolvedValue([]);
    vi.spyOn(tripsApi, "listItineraryItems").mockResolvedValue([]);
  });

  it("renders accessible chat controls and read-only proposal UX", async () => {
    const { container } = renderWithQueryClient(<AssistantScreen tripId={trip.id} />);
    expect(await screen.findByText("I prepared a move for review.")).toBeVisible();
    expect(screen.getByLabelText("Message")).toBeVisible();
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Apply" })).toBeDisabled();
    expect(screen.getByText(/your Trip role cannot apply/)).toBeVisible();
    await expectNoAxeViolations(container);
  });

  it("streams deltas locally and reconciles the completed turn", async () => {
    const emptyConversation = { ...conversation, turns: [] };
    vi.mocked(assistantApi.getConversation).mockResolvedValue(emptyConversation);
    vi.mocked(tripsApi.get).mockResolvedValue({ ...trip, accessRole: "editor" });
    vi.spyOn(assistantApi, "streamTurn").mockImplementation(
      async (_tripId, _conversationId, message, handlers) => {
        handlers.onEvent({
          delta: "Checking ",
          type: "assistant.delta",
        });
        handlers.onEvent({
          status: "Checking your itinerary…",
          type: "assistant.tool",
        });
        handlers.onEvent({
          delta: "Day 3.",
          type: "assistant.delta",
        });
        handlers.onEvent({
          turn: {
            ...conversation.turns[0]!,
            assistantContent: "Checking Day 3.",
            proposals: [],
            userContent: message,
          },
          type: "assistant.completed",
        });
      },
    );
    const user = userEvent.setup();
    renderWithQueryClient(<AssistantScreen tripId={trip.id} />);

    const composer = await screen.findByLabelText("Message");
    await user.type(composer, "What's planned?{Control>}{Enter}{/Control}");

    expect(await screen.findByText("Checking Day 3.")).toBeVisible();
    expect(screen.getByText("Assistant response complete.")).toBeInTheDocument();
    expect(assistantApi.streamTurn).toHaveBeenCalledWith(
      trip.id,
      conversation.id,
      "What's planned?",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("aborts streaming with Stop and leaves the composer usable", async () => {
    vi.mocked(assistantApi.getConversation).mockResolvedValue({ ...conversation, turns: [] });
    vi.spyOn(assistantApi, "streamTurn").mockImplementation(
      (_tripId, _conversationId, _message, handlers) =>
        new Promise((_resolve, reject) => {
          handlers.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
        }),
    );
    const user = userEvent.setup();
    renderWithQueryClient(<AssistantScreen tripId={trip.id} />);

    await user.type(await screen.findByLabelText("Message"), "Long answer");
    await user.click(screen.getByRole("button", { name: "Send" }));
    await user.click(await screen.findByRole("button", { name: "Stop" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Send" })).toBeVisible());
    expect(screen.getByLabelText("Message")).toBeEnabled();
  });

  it("shows safe streamed errors and can apply an editor-owned proposal", async () => {
    vi.mocked(tripsApi.get).mockResolvedValue({ ...trip, accessRole: "editor" });
    vi.spyOn(assistantApi, "streamTurn").mockImplementation(
      async (_tripId, _conversationId, _message, handlers) => {
        handlers.onEvent({
          code: "AI_PROVIDER_BUSY",
          message: "The assistant provider is busy.",
          type: "assistant.error",
        });
      },
    );
    const applied = {
      ...conversation.turns[0]!.proposals[0]!,
      appliedAt: "2027-01-01T00:00:02.000Z",
      status: "applied" as const,
    };
    const apply = vi.spyOn(assistantApi, "applyProposal").mockResolvedValue(applied);
    const user = userEvent.setup();
    renderWithQueryClient(<AssistantScreen tripId={trip.id} />);

    await user.type(await screen.findByLabelText("Message"), "Try provider");
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("The assistant provider is busy.")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Apply" }));
    await waitFor(() => expect(apply).toHaveBeenCalledWith(trip.id, applied.id));
    expect(await screen.findByText("Applied")).toBeVisible();
  });
});
