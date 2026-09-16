import { Inject, Injectable } from "@nestjs/common";
import type { TripDay } from "@tripforge/contracts";
import { and, asc, eq } from "drizzle-orm";

import { DATABASE } from "../database/database.constants";
import type { Database } from "../database/database.provider";
import { tripDays } from "../database/schema";

const daySelection = {
  date: tripDays.date,
  destinationId: tripDays.destinationId,
  id: tripDays.id,
};

@Injectable()
export class TripDaysRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  list(tripId: string): Promise<TripDay[]> {
    return this.database
      .select(daySelection)
      .from(tripDays)
      .where(eq(tripDays.tripId, tripId))
      .orderBy(asc(tripDays.date), asc(tripDays.id));
  }

  async updateDestination(
    tripId: string,
    dayId: string,
    destinationId: string | null,
  ): Promise<TripDay | undefined> {
    const [day] = await this.database
      .update(tripDays)
      .set({ destinationId, updatedAt: new Date() })
      .where(and(eq(tripDays.tripId, tripId), eq(tripDays.id, dayId)))
      .returning(daySelection);

    return day;
  }
}
