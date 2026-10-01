import "./observability/register-worker";

import { NestFactory } from "@nestjs/core";

import { AppLogger } from "./observability/app-logger.service";
import { WorkerModule } from "./worker.module";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(WorkerModule, {
    bufferLogs: true,
  });
  app.useLogger(app.get(AppLogger));
  app.enableShutdownHooks(["SIGINT", "SIGTERM"]);
}

void bootstrap().catch(() => {
  const logger = new AppLogger();
  logger.event("error", "worker.bootstrap.failed", {
    errorType: "BootstrapError",
  });
  process.exitCode = 1;
});
