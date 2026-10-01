import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import { BackgroundJobsModule } from "./background-jobs/background-jobs.module";
import { validateWorkerEnvironment } from "./config/worker-environment";
import { ObservabilityModule } from "./observability/observability.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      cache: true,
      isGlobal: true,
      validate: validateWorkerEnvironment,
    }),
    ObservabilityModule,
    BackgroundJobsModule,
  ],
})
export class WorkerModule {}
