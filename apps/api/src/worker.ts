import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";

import { WorkerModule } from "./worker.module";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(WorkerModule);
  app.enableShutdownHooks(["SIGINT", "SIGTERM"]);
}

void bootstrap().catch(() => {
  const logger = new Logger("WorkerBootstrap");
  logger.error("Worker startup failed");
  process.exitCode = 1;
});
