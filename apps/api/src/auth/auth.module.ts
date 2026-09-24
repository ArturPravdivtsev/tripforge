import { Module } from "@nestjs/common";

import { DatabaseModule } from "../database/database.module";
import { RealtimePublisherModule } from "../realtime/realtime-publisher.module";
import { AuthController } from "./auth.controller";
import { AuthRepository } from "./auth.repository";
import { AuthService } from "./auth.service";
import { BrowserMutationGuard } from "./browser/browser-mutation.guard";
import { SessionAuthGuard } from "./guards/session-auth.guard";
import { PasswordHasherService } from "./password/password-hasher.service";
import { SessionService } from "./session/session.service";

@Module({
  imports: [DatabaseModule, RealtimePublisherModule],
  controllers: [AuthController],
  providers: [
    AuthRepository,
    AuthService,
    BrowserMutationGuard,
    PasswordHasherService,
    SessionAuthGuard,
    SessionService,
  ],
  exports: [
    AuthRepository,
    BrowserMutationGuard,
    SessionAuthGuard,
    SessionService,
  ],
})
export class AuthModule {}
