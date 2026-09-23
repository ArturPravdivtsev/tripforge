import { Injectable } from "@nestjs/common";

import { TripDocumentsRepository } from "../trips/trip-documents.repository";
import {
  MAINTENANCE_BATCH_SIZE,
  STALE_PENDING_AGE_MS,
} from "./background-jobs.constants";

@Injectable()
export class StalePendingCleaner {
  constructor(private readonly documents: TripDocumentsRepository) {}

  cleanup(now = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - STALE_PENDING_AGE_MS);
    return this.documents.cleanupStalePending(
      cutoff,
      MAINTENANCE_BATCH_SIZE,
    );
  }
}
