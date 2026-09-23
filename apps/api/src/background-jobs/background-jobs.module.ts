import { Module } from "@nestjs/common";

import { DatabaseModule } from "../database/database.module";
import { StorageModule } from "../storage/storage.module";
import { TripDocumentsRepository } from "../trips/trip-documents.repository";
import { BackgroundJobsService } from "./background-jobs.service";
import { CleanupOutboxDispatcher } from "./cleanup-outbox-dispatcher.service";
import { JobSchedulerRegistrar } from "./job-scheduler-registrar.service";
import { StalePendingCleaner } from "./stale-pending-cleaner.service";
import { StorageCleanupOutboxRepository } from "./storage-cleanup-outbox.repository";
import { StorageCleanupProcessor } from "./storage-cleanup.processor";

@Module({
  imports: [DatabaseModule, StorageModule],
  providers: [
    BackgroundJobsService,
    CleanupOutboxDispatcher,
    JobSchedulerRegistrar,
    StalePendingCleaner,
    StorageCleanupOutboxRepository,
    StorageCleanupProcessor,
    TripDocumentsRepository,
  ],
})
export class BackgroundJobsModule {}
