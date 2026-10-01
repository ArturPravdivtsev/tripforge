import "./observability/register-api";

import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";

import { AppModule } from "./app.module";
import { configureApplication } from "./common/configure-application";
import { AppLogger } from "./observability/app-logger.service";
import { ObservabilityMetrics } from "./observability/metrics.service";
import { TripForgeIoAdapter } from "./realtime/tripforge-io.adapter";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const configService = app.get(ConfigService);
  const port = configService.getOrThrow<number>("PORT");

  app.useLogger(app.get(AppLogger));
  app.enableShutdownHooks();
  configureApplication(app);
  app.useWebSocketAdapter(
    new TripForgeIoAdapter(
      app,
      configService,
      app.get(AppLogger),
      app.get(ObservabilityMetrics),
    ),
  );

  await app.listen(port);
}

void bootstrap();
