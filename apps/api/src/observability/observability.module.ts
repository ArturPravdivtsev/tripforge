import { Global, Module } from "@nestjs/common";

import {
  APP_LOG_DESTINATION,
  AppLogger,
} from "./app-logger.service";
import { ObservabilityMetrics } from "./metrics.service";

@Global()
@Module({
  exports: [AppLogger, ObservabilityMetrics],
  providers: [
    { provide: APP_LOG_DESTINATION, useValue: process.stdout },
    AppLogger,
    ObservabilityMetrics,
  ],
})
export class ObservabilityModule {}
