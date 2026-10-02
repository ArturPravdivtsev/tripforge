import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  UseGuards,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type {
  AiConversationDetail,
  AiConversationSummary,
  AiSseEvent,
} from "@tripforge/contracts";

import type { AuthenticatedUser } from "../auth/auth.types";
import { BrowserMutationGuard } from "../auth/browser/browser-mutation.guard";
import { RequireJsonBody } from "../auth/browser/require-json-body.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { SessionAuthGuard } from "../auth/guards/session-auth.guard";
import { SecurityRateLimit } from "../security/security-rate-limit.decorator";
import { SecurityRateLimitGuard } from "../security/security-rate-limit.guard";
import { withInternalSpan } from "../observability/tracing";
import { AiConversationsService } from "./ai-conversations.service";
import { AiTurnsService } from "./ai-turns.service";
import { AiProposalsService } from "./ai-proposals.service";
import { CreateAiTurnDto } from "./dto/create-ai-turn.dto";

type SseResponse = {
  destroyed: boolean;
  writableEnded: boolean;
  end(): void;
  flushHeaders(): void;
  once(event: "close", listener: () => void): void;
  setHeader(name: string, value: string): void;
  status(code: number): SseResponse;
  write(chunk: string): void;
};

@Controller("trips/:tripId/assistant")
@UseGuards(SessionAuthGuard, BrowserMutationGuard, SecurityRateLimitGuard)
export class AiController {
  constructor(
    private readonly conversations: AiConversationsService,
    private readonly turns: AiTurnsService,
    private readonly proposals: AiProposalsService,
    private readonly config: ConfigService,
  ) {}

  @Get("conversations")
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param("tripId", ParseUUIDPipe) tripId: string,
  ): Promise<AiConversationSummary[]> {
    return this.conversations.list(user.id, tripId);
  }

  @Post("conversations")
  @HttpCode(HttpStatus.CREATED)
  @RequireJsonBody()
  @SecurityRateLimit("aiConversationCreate")
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param("tripId", ParseUUIDPipe) tripId: string,
  ): Promise<AiConversationSummary> {
    return this.conversations.create(user.id, tripId);
  }

  @Get("conversations/:conversationId")
  detail(
    @CurrentUser() user: AuthenticatedUser,
    @Param("tripId", ParseUUIDPipe) tripId: string,
    @Param("conversationId", ParseUUIDPipe) conversationId: string,
  ): Promise<AiConversationDetail> {
    return this.conversations.detail(user.id, tripId, conversationId);
  }

  @Delete("conversations/:conversationId")
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(
    @CurrentUser() user: AuthenticatedUser,
    @Param("tripId", ParseUUIDPipe) tripId: string,
    @Param("conversationId", ParseUUIDPipe) conversationId: string,
  ): Promise<void> {
    return this.conversations.delete(user.id, tripId, conversationId);
  }

  @Post("conversations/:conversationId/turns")
  @RequireJsonBody()
  @SecurityRateLimit("aiTurn")
  async turn(
    @CurrentUser() user: AuthenticatedUser,
    @Param("tripId", ParseUUIDPipe) tripId: string,
    @Param("conversationId", ParseUUIDPipe) conversationId: string,
    @Body() input: CreateAiTurnDto,
    @Res() response: SseResponse,
  ): Promise<void> {
    this.conversations.assertAvailable();
    await this.conversations.detail(user.id, tripId, conversationId);
    response.status(HttpStatus.OK);
    response.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    response.setHeader("Cache-Control", "private, no-store");
    response.setHeader("X-Accel-Buffering", "no");
    response.flushHeaders();

    const abort = new AbortController();
    const timeout = setTimeout(
      () => abort.abort("timeout"),
      this.config.get<number>("OPENAI_TIMEOUT_MS") ?? 45_000,
    );
    timeout.unref();
    response.once("close", () => {
      if (!response.writableEnded) abort.abort("client-disconnected");
    });
    const emit = (event: AiSseEvent) => {
      if (!response.writableEnded && !response.destroyed) {
        response.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
      }
    };
    try {
      await withInternalSpan("ai.turn", {}, () =>
        this.turns.run(
          user.id,
          tripId,
          conversationId,
          input.message,
          abort.signal,
          emit,
        ),
      );
    } finally {
      clearTimeout(timeout);
      if (!response.writableEnded) response.end();
    }
  }

  @Post("proposals/:proposalId/apply")
  @HttpCode(HttpStatus.OK)
  applyProposal(
    @CurrentUser() user: AuthenticatedUser,
    @Param("tripId", ParseUUIDPipe) tripId: string,
    @Param("proposalId", ParseUUIDPipe) proposalId: string,
  ) {
    this.conversations.assertAvailable();
    return this.proposals.apply(user.id, tripId, proposalId);
  }

  @Post("proposals/:proposalId/dismiss")
  @HttpCode(HttpStatus.OK)
  dismissProposal(
    @CurrentUser() user: AuthenticatedUser,
    @Param("tripId", ParseUUIDPipe) tripId: string,
    @Param("proposalId", ParseUUIDPipe) proposalId: string,
  ) {
    this.conversations.assertAvailable();
    return this.proposals.dismiss(user.id, tripId, proposalId);
  }
}
