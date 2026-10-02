import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { DatabaseModule } from "../database/database.module";
import { ObservabilityModule } from "../observability/observability.module";
import { RealtimePublisherModule } from "../realtime/realtime-publisher.module";
import { SecurityModule } from "../security/security.module";
import { TripsModule } from "../trips/trips.module";
import { AI_MODEL_CLIENT } from "./ai.constants";
import { AiConversationsService } from "./ai-conversations.service";
import { AiController } from "./ai.controller";
import { AiRepository } from "./ai.repository";
import { AiProposalsService } from "./ai-proposals.service";
import { AiToolRegistry } from "./ai-tool-registry";
import { AiTurnsService } from "./ai-turns.service";
import { OpenAiClientService } from "./openai-client.service";

@Module({
  controllers: [AiController],
  imports: [
    AuthModule,
    DatabaseModule,
    ObservabilityModule,
    RealtimePublisherModule,
    SecurityModule,
    TripsModule,
  ],
  providers: [
    AiConversationsService,
    AiRepository,
    AiProposalsService,
    AiToolRegistry,
    AiTurnsService,
    OpenAiClientService,
    { provide: AI_MODEL_CLIENT, useExisting: OpenAiClientService },
  ],
})
export class AiModule {}
