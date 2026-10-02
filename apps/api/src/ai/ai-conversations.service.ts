import { HttpException, HttpStatus, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type {
  AiConversationDetail,
  AiConversationSummary,
} from "@tripforge/contracts";

import { TripPermissionsService } from "../trips/trip-permissions.service";
import { AiRepository } from "./ai.repository";

@Injectable()
export class AiConversationsService {
  constructor(
    private readonly repository: AiRepository,
    private readonly permissions: TripPermissionsService,
    private readonly config: ConfigService,
  ) {}

  assertAvailable(): void {
    if (
      !this.config.get<boolean>("AI_ASSISTANT_ENABLED") ||
      !this.config.get<string>("OPENAI_API_KEY")
    ) {
      throw aiError(
        "AI_ASSISTANT_UNAVAILABLE",
        "The assistant is not available right now",
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  async list(userId: string, tripId: string): Promise<AiConversationSummary[]> {
    this.assertAvailable();
    await this.permissions.requireReadable(userId, tripId);
    return this.repository.list(tripId, userId, 20);
  }

  async create(userId: string, tripId: string): Promise<AiConversationSummary> {
    this.assertAvailable();
    await this.permissions.requireReadable(userId, tripId);
    return this.repository.create(tripId, userId);
  }

  async detail(
    userId: string,
    tripId: string,
    conversationId: string,
  ): Promise<AiConversationDetail> {
    this.assertAvailable();
    await this.permissions.requireReadable(userId, tripId);
    const conversation = await this.repository.detail(
      tripId,
      userId,
      conversationId,
    );
    if (!conversation) throw conversationNotFound();
    return conversation;
  }

  async delete(
    userId: string,
    tripId: string,
    conversationId: string,
  ): Promise<void> {
    this.assertAvailable();
    await this.permissions.requireReadable(userId, tripId);
    if (!(await this.repository.delete(tripId, userId, conversationId))) {
      throw conversationNotFound();
    }
  }
}

export function conversationNotFound(): HttpException {
  return aiError(
    "AI_CONVERSATION_NOT_FOUND",
    "Assistant conversation not found",
    HttpStatus.NOT_FOUND,
  );
}

export function aiError(
  code: string,
  message: string,
  status: HttpStatus,
): HttpException {
  return new HttpException({ code, message }, status);
}
