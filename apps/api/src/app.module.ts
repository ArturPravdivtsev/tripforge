import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_FILTER } from "@nestjs/core";

import { AuthModule } from "./auth/auth.module";
import { AiModule } from "./ai/ai.module";
import { ApiExceptionFilter } from "./common/filters/api-exception.filter";
import { validateEnvironment } from "./config/environment";
import { DatabaseModule } from "./database/database.module";
import { HealthController } from "./health.controller";
import { NotificationsModule } from "./notifications/notifications.module";
import { ObservabilityModule } from "./observability/observability.module";
import { RealtimeModule } from "./realtime/realtime.module";
import { SecurityModule } from "./security/security.module";
import { TripsModule } from "./trips/trips.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      cache: true,
      isGlobal: true,
      validate: validateEnvironment,
    }),
    ObservabilityModule,
    AiModule,
    AuthModule,
    DatabaseModule,
    NotificationsModule,
    RealtimeModule,
    SecurityModule,
    TripsModule,
  ],
  controllers: [HealthController],
  providers: [
    {
      provide: APP_FILTER,
      useClass: ApiExceptionFilter,
    },
  ],
})
export class AppModule {}
