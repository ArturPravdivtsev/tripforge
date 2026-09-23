import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";

import { WorkerModule } from "./worker.module";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(WorkerModule);
  app.enableShutdownHooks(["SIGINT", "SIGTERM"]);
}

void bootstrap().catch((error: unknown) => {
  const logger = new Logger("WorkerBootstrap");
  logger.error(
    "Worker startup failed",
    error instanceof Error ? error.stack : undefined,
  );
  process.exitCode = 1;
});
