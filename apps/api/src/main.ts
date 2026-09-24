import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";

import { AppModule } from "./app.module";
import { configureApplication } from "./common/configure-application";
import { TripForgeIoAdapter } from "./realtime/tripforge-io.adapter";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const port = configService.getOrThrow<number>("PORT");

  app.enableShutdownHooks();
  configureApplication(app);
  app.useWebSocketAdapter(new TripForgeIoAdapter(app, configService));

  await app.listen(port);
}

void bootstrap();
