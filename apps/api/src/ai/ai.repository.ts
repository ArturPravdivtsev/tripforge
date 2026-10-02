import { Inject, Injectable } from "@nestjs/common";
import type {
  AiConversationDetail,
  AiConversationSummary,
  AiProposal,
  AiProposalPayload,
  AiTurn,
} from "@tripforge/contracts";
import { and, asc, desc, eq, inArray, lt } from "drizzle-orm";

import { DATABASE } from "../database/database.constants";
import type { Database } from "../database/database.provider";
import {
  tripAiConversations,
  tripAiProposals,
  tripAiTurns,
} from "../database/schema";
import {
  AI_HISTORY_CHARACTER_BUDGET,
  AI_HISTORY_TURNS,
  AI_PENDING_STALE_MS,
  TRIP_ASSISTANT_PROMPT_VERSION,
} from "./ai.constants";
import type { AiModelUsage } from "./ai-model-client";

type ProposalDraft = Readonly<{ payload: AiProposalPayload }>;

@Injectable()
export class AiRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async list(
    tripId: string,
    userId: string,
    limit: number,
  ): Promise<AiConversationSummary[]> {
    const rows = await this.database
      .select()
      .from(tripAiConversations)
      .where(
        and(
          eq(tripAiConversations.tripId, tripId),
          eq(tripAiConversations.userId, userId),
        ),
      )
      .orderBy(desc(tripAiConversations.updatedAt), desc(tripAiConversations.id))
      .limit(limit);
    return rows.map(toConversation);
  }

  async create(tripId: string, userId: string): Promise<AiConversationSummary> {
    const [row] = await this.database
      .insert(tripAiConversations)
      .values({ title: "New conversation", tripId, userId })
      .returning();
    if (!row) throw new Error("AI conversation insert did not return a row");
    return toConversation(row);
  }

  async owned(
    tripId: string,
    userId: string,
    conversationId: string,
  ): Promise<AiConversationSummary | undefined> {
    const [row] = await this.database
      .select()
      .from(tripAiConversations)
      .where(
        and(
          eq(tripAiConversations.id, conversationId),
          eq(tripAiConversations.tripId, tripId),
          eq(tripAiConversations.userId, userId),
        ),
      )
      .limit(1);
    return row ? toConversation(row) : undefined;
  }

  async detail(
    tripId: string,
    userId: string,
    conversationId: string,
  ): Promise<AiConversationDetail | undefined> {
    const conversation = await this.owned(tripId, userId, conversationId);
    if (!conversation) return undefined;
    const turns = (
      await this.database
      .select()
      .from(tripAiTurns)
      .where(eq(tripAiTurns.conversationId, conversationId))
      .orderBy(desc(tripAiTurns.createdAt), desc(tripAiTurns.id))
      .limit(100)
    ).reverse();
    const allProposals =
      turns.length === 0
        ? []
        : await this.database
            .select()
            .from(tripAiProposals)
            .where(inArray(tripAiProposals.turnId, turns.map(({ id }) => id)))
            .orderBy(asc(tripAiProposals.createdAt), asc(tripAiProposals.id));
    return {
      ...conversation,
      turns: turns.map((turn) =>
        toTurn(
          turn,
          allProposals.filter(({ turnId }) => turnId === turn.id),
        ),
      ),
    };
  }

  async delete(
    tripId: string,
    userId: string,
    conversationId: string,
  ): Promise<boolean> {
    const rows = await this.database
      .delete(tripAiConversations)
      .where(
        and(
          eq(tripAiConversations.id, conversationId),
          eq(tripAiConversations.tripId, tripId),
          eq(tripAiConversations.userId, userId),
        ),
      )
      .returning({ id: tripAiConversations.id });
    return rows.length === 1;
  }

  async startTurn(
    tripId: string,
    userId: string,
    conversationId: string,
    userContent: string,
  ): Promise<{ id: string; createdAt: Date } | undefined> {
    return this.database.transaction(async (transaction) => {
      const [conversation] = await transaction
        .select({ id: tripAiConversations.id, title: tripAiConversations.title })
        .from(tripAiConversations)
        .where(
          and(
            eq(tripAiConversations.id, conversationId),
            eq(tripAiConversations.tripId, tripId),
            eq(tripAiConversations.userId, userId),
          ),
        )
        .for("update")
        .limit(1);
      if (!conversation) return undefined;

      await transaction
        .update(tripAiTurns)
        .set({
          completedAt: new Date(),
          errorCode: "AI_STALE_PENDING_TURN",
          status: "failed",
        })
        .where(
          and(
            eq(tripAiTurns.conversationId, conversationId),
            eq(tripAiTurns.status, "pending"),
            lt(
              tripAiTurns.createdAt,
              new Date(Date.now() - AI_PENDING_STALE_MS),
            ),
          ),
        );

      const [turn] = await transaction
        .insert(tripAiTurns)
        .values({
          conversationId,
          promptVersion: TRIP_ASSISTANT_PROMPT_VERSION,
          status: "pending",
          userContent,
        })
        .returning({ createdAt: tripAiTurns.createdAt, id: tripAiTurns.id });
      if (!turn) throw new Error("AI turn insert did not return a row");

      await transaction
        .update(tripAiConversations)
        .set({
          ...(conversation.title === "New conversation"
            ? { title: conversationTitle(userContent) }
            : {}),
          updatedAt: new Date(),
        })
        .where(eq(tripAiConversations.id, conversationId));
      return turn;
    });
  }

  async history(conversationId: string): Promise<Array<{ role: "user" | "assistant"; content: string }>> {
    const rows = await this.database
      .select({
        assistantContent: tripAiTurns.assistantContent,
        userContent: tripAiTurns.userContent,
      })
      .from(tripAiTurns)
      .where(
        and(
          eq(tripAiTurns.conversationId, conversationId),
          eq(tripAiTurns.status, "completed"),
        ),
      )
      .orderBy(desc(tripAiTurns.createdAt), desc(tripAiTurns.id))
      .limit(AI_HISTORY_TURNS);
    const messages: Array<{ role: "user" | "assistant"; content: string }> = [];
    let remaining = AI_HISTORY_CHARACTER_BUDGET;
    for (const row of rows.reverse()) {
      const pair = [
        { content: row.userContent, role: "user" as const },
        { content: row.assistantContent ?? "", role: "assistant" as const },
      ];
      for (const message of pair) {
        if (!message.content || remaining <= 0) continue;
        const content = message.content.slice(0, remaining);
        messages.push({ ...message, content });
        remaining -= content.length;
      }
    }
    return messages;
  }

  async completeTurn(
    turnId: string,
    assistantContent: string,
    model: string,
    usage: AiModelUsage,
    drafts: readonly ProposalDraft[],
  ): Promise<AiTurn> {
    await this.database.transaction(async (transaction) => {
      const [turn] = await transaction
        .update(tripAiTurns)
        .set({
          assistantContent,
          cachedInputTokens: usage.cachedInputTokens,
          completedAt: new Date(),
          inputTokens: usage.inputTokens,
          model,
          outputTokens: usage.outputTokens,
          reasoningTokens: usage.reasoningTokens,
          status: "completed",
        })
        .where(and(eq(tripAiTurns.id, turnId), eq(tripAiTurns.status, "pending")))
        .returning({ conversationId: tripAiTurns.conversationId });
      if (!turn) throw new Error("AI pending turn disappeared before completion");
      if (drafts.length > 0) {
        await transaction.insert(tripAiProposals).values(
          drafts.map(({ payload }) => ({
            payload,
            turnId,
            type: payload.type,
          })),
        );
      }
      await transaction
        .update(tripAiConversations)
        .set({ updatedAt: new Date() })
        .where(eq(tripAiConversations.id, turn.conversationId));
    });
    const turn = await this.getTurn(turnId);
    if (!turn) throw new Error("Completed AI turn could not be reloaded");
    return turn;
  }

  async failTurn(turnId: string, errorCode: string): Promise<void> {
    await this.database
      .update(tripAiTurns)
      .set({ completedAt: new Date(), errorCode, status: "failed" })
      .where(and(eq(tripAiTurns.id, turnId), eq(tripAiTurns.status, "pending")));
  }

  async getTurn(turnId: string): Promise<AiTurn | undefined> {
    const [turn] = await this.database
      .select()
      .from(tripAiTurns)
      .where(eq(tripAiTurns.id, turnId))
      .limit(1);
    if (!turn) return undefined;
    const proposals = await this.database
      .select()
      .from(tripAiProposals)
      .where(eq(tripAiProposals.turnId, turnId))
      .orderBy(asc(tripAiProposals.createdAt));
    return toTurn(turn, proposals);
  }
}

function conversationTitle(message: string): string {
  const compact = message.replace(/\s+/gu, " ").trim();
  return compact.slice(0, 60) || "New conversation";
}

function toConversation(row: typeof tripAiConversations.$inferSelect): AiConversationSummary {
  return {
    createdAt: row.createdAt.toISOString(),
    id: row.id,
    title: row.title,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toProposal(row: typeof tripAiProposals.$inferSelect): AiProposal {
  return {
    appliedAt: row.appliedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    dismissedAt: row.dismissedAt?.toISOString() ?? null,
    id: row.id,
    payload: row.payload,
    status: row.status,
    type: row.type,
  };
}

function toTurn(
  row: typeof tripAiTurns.$inferSelect,
  proposals: Array<typeof tripAiProposals.$inferSelect>,
): AiTurn {
  return {
    assistantContent: row.assistantContent,
    completedAt: row.completedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    errorCode: row.errorCode,
    id: row.id,
    model: row.model,
    promptVersion: row.promptVersion,
    proposals: proposals.map(toProposal),
    status: row.status,
    userContent: row.userContent,
  };
}
