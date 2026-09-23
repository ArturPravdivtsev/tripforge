import { Inject, Injectable } from "@nestjs/common";
import { and, asc, eq, isNull } from "drizzle-orm";

import { DATABASE } from "../database/database.constants";
import type { Database } from "../database/database.provider";
import { storageCleanupOutbox } from "../database/schema";

export type StorageCleanupOutboxRecord = Readonly<{
  id: string;
  storageKey: string;
  completedAt: Date | null;
  failedAt: Date | null;
}>;

@Injectable()
export class StorageCleanupOutboxRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async find(id: string): Promise<StorageCleanupOutboxRecord | undefined> {
    const [row] = await this.database
      .select({
        completedAt: storageCleanupOutbox.completedAt,
        failedAt: storageCleanupOutbox.failedAt,
        id: storageCleanupOutbox.id,
        storageKey: storageCleanupOutbox.storageKey,
      })
      .from(storageCleanupOutbox)
      .where(eq(storageCleanupOutbox.id, id))
      .limit(1);
    return row;
  }

  async listDispatchable(limit: number): Promise<Array<{ id: string }>> {
    return this.database
      .select({ id: storageCleanupOutbox.id })
      .from(storageCleanupOutbox)
      .where(
        and(
          isNull(storageCleanupOutbox.completedAt),
          isNull(storageCleanupOutbox.failedAt),
        ),
      )
      .orderBy(
        asc(storageCleanupOutbox.createdAt),
        asc(storageCleanupOutbox.id),
      )
      .limit(limit);
  }

  async markDispatched(id: string): Promise<void> {
    await this.database
      .update(storageCleanupOutbox)
      .set({ lastDispatchedAt: new Date() })
      .where(
        and(
          eq(storageCleanupOutbox.id, id),
          isNull(storageCleanupOutbox.completedAt),
          isNull(storageCleanupOutbox.failedAt),
        ),
      );
  }

  async markCompleted(id: string): Promise<void> {
    await this.database
      .update(storageCleanupOutbox)
      .set({ completedAt: new Date(), failedAt: null })
      .where(
        and(
          eq(storageCleanupOutbox.id, id),
          isNull(storageCleanupOutbox.completedAt),
        ),
      );
  }

  async markFailed(id: string): Promise<void> {
    await this.database
      .update(storageCleanupOutbox)
      .set({ failedAt: new Date() })
      .where(
        and(
          eq(storageCleanupOutbox.id, id),
          isNull(storageCleanupOutbox.completedAt),
        ),
      );
  }
}
