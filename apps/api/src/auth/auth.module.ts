import { Module } from "@nestjs/common";

import { DatabaseModule } from "../database/database.module";
import { AuthController } from "./auth.controller";
import { AuthRepository } from "./auth.repository";
import { AuthService } from "./auth.service";
import { SessionAuthGuard } from "./guards/session-auth.guard";
import { PasswordHasherService } from "./password/password-hasher.service";
import { SessionService } from "./session/session.service";

@Module({
  imports: [DatabaseModule],
  controllers: [AuthController],
  providers: [
    AuthRepository,
    AuthService,
    PasswordHasherService,
    SessionAuthGuard,
    SessionService,
  ],
  exports: [AuthRepository],
})
export class AuthModule {}
