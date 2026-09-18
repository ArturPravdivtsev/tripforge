import { Inject, Injectable } from "@nestjs/common";
import type {
  TransportReservationDetails,
  TransportReservationMode,
  TripReservation,
  TripReservationKind,
  TripReservationStatus,
} from "@tripforge/contracts";
import { and, asc, eq, sql } from "drizzle-orm";

import { DATABASE } from "../database/database.constants";
import type { Database } from "../database/database.provider";
import {
  itineraryItems,
  reservationTransportDetails,
  tripDays,
  tripReservations,
} from "../database/schema";

const reservationSelection = {
  confirmationCode: tripReservations.confirmationCode,
  createdAt: tripReservations.createdAt,
  destinationName: reservationTransportDetails.destinationName,
  endDate: tripReservations.endDate,
  endTime: tripReservations.endTime,
  id: tripReservations.id,
  itineraryItemId: tripReservations.itineraryItemId,
  kind: tripReservations.kind,
  locationName: tripReservations.locationName,
  notes: tripReservations.notes,
  operatorName: reservationTransportDetails.operatorName,
  originName: reservationTransportDetails.originName,
  providerName: tripReservations.providerName,
  serviceNumber: reservationTransportDetails.serviceNumber,
  startDate: tripReservations.startDate,
  startTime: tripReservations.startTime,
  status: tripReservations.status,
  title: tripReservations.title,
  transportMode: reservationTransportDetails.mode,
  updatedAt: tripReservations.updatedAt,
};

type ReservationRow = {
  confirmationCode: string | null;
  createdAt: Date;
  destinationName: string | null;
  endDate: string | null;
  endTime: string | null;
  id: string;
  itineraryItemId: string | null;
  kind: TripReservationKind;
  locationName: string | null;
  notes: string | null;
  operatorName: string | null;
  originName: string | null;
  providerName: string | null;
  serviceNumber: string | null;
  startDate: string;
  startTime: string | null;
  status: TripReservationStatus;
  title: string;
  transportMode: TransportReservationMode | null;
  updatedAt: Date;
};

export type ReservationState = Readonly<{
  confirmationCode: string | null;
  endDate: string | null;
  endTime: string | null;
  itineraryItemId: string | null;
  kind: TripReservationKind;
  locationName: string | null;
  notes: string | null;
  providerName: string | null;
  startDate: string;
  startTime: string | null;
  status: TripReservationStatus;
  title: string;
  transport: TransportReservationDetails | null;
}>;

@Injectable()
export class TripReservationsRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async list(tripId: string): Promise<TripReservation[]> {
    const rows = await this.baseQuery()
      .where(eq(tripReservations.tripId, tripId))
      .orderBy(
        asc(tripReservations.startDate),
        sql`${tripReservations.startTime} asc nulls last`,
        asc(tripReservations.createdAt),
        asc(tripReservations.id),
      );

    return rows.map(toReservation);
  }

  async find(
    tripId: string,
    reservationId: string,
  ): Promise<TripReservation | undefined> {
    const [row] = await this.baseQuery()
      .where(
        and(
          eq(tripReservations.tripId, tripId),
          eq(tripReservations.id, reservationId),
        ),
      )
      .limit(1);

    return row ? toReservation(row) : undefined;
  }

  async itineraryItemBelongsToTrip(
    tripId: string,
    itineraryItemId: string,
  ): Promise<boolean> {
    const [row] = await this.database
      .select({ id: itineraryItems.id })
      .from(itineraryItems)
      .innerJoin(tripDays, eq(tripDays.id, itineraryItems.tripDayId))
      .where(
        and(
          eq(itineraryItems.id, itineraryItemId),
          eq(tripDays.tripId, tripId),
        ),
      )
      .limit(1);

    return Boolean(row);
  }

  async create(tripId: string, state: ReservationState): Promise<TripReservation> {
    return this.database.transaction(async (transaction) => {
      const [row] = await transaction
        .insert(tripReservations)
        .values({
          confirmationCode: state.confirmationCode,
          endDate: state.endDate,
          endTime: state.endTime,
          itineraryItemId: state.itineraryItemId,
          kind: state.kind,
          locationName: state.locationName,
          notes: state.notes,
          providerName: state.providerName,
          startDate: state.startDate,
          startTime: state.startTime,
          status: state.status,
          title: state.title,
          tripId,
        })
        .returning({ id: tripReservations.id });

      if (!row) throw new Error("Reservation insert did not return a row");
      if (state.transport) {
        await transaction.insert(reservationTransportDetails).values({
          ...state.transport,
          reservationId: row.id,
        });
      }

      const created = await selectReservation(transaction, tripId, row.id);
      if (!created) throw new Error("Created reservation could not be loaded");
      return created;
    });
  }

  async update(
    tripId: string,
    reservationId: string,
    state: ReservationState,
  ): Promise<TripReservation | undefined> {
    return this.database.transaction(async (transaction) => {
      const rows = await transaction
        .update(tripReservations)
        .set({
          confirmationCode: state.confirmationCode,
          endDate: state.endDate,
          endTime: state.endTime,
          itineraryItemId: state.itineraryItemId,
          kind: state.kind,
          locationName: state.locationName,
          notes: state.notes,
          providerName: state.providerName,
          startDate: state.startDate,
          startTime: state.startTime,
          status: state.status,
          title: state.title,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(tripReservations.tripId, tripId),
            eq(tripReservations.id, reservationId),
          ),
        )
        .returning({ id: tripReservations.id });

      if (rows.length === 0) return undefined;

      await transaction
        .delete(reservationTransportDetails)
        .where(eq(reservationTransportDetails.reservationId, reservationId));
      if (state.transport) {
        await transaction.insert(reservationTransportDetails).values({
          ...state.transport,
          reservationId,
        });
      }

      return selectReservation(transaction, tripId, reservationId);
    });
  }

  async delete(tripId: string, reservationId: string): Promise<boolean> {
    const rows = await this.database
      .delete(tripReservations)
      .where(
        and(
          eq(tripReservations.tripId, tripId),
          eq(tripReservations.id, reservationId),
        ),
      )
      .returning({ id: tripReservations.id });

    return rows.length > 0;
  }

  private baseQuery() {
    return this.database
      .select(reservationSelection)
      .from(tripReservations)
      .leftJoin(
        reservationTransportDetails,
        eq(reservationTransportDetails.reservationId, tripReservations.id),
      );
  }
}

async function selectReservation(
  database: Parameters<Parameters<Database["transaction"]>[0]>[0],
  tripId: string,
  reservationId: string,
): Promise<TripReservation | undefined> {
  const [row] = await database
    .select(reservationSelection)
    .from(tripReservations)
    .leftJoin(
      reservationTransportDetails,
      eq(reservationTransportDetails.reservationId, tripReservations.id),
    )
    .where(
      and(
        eq(tripReservations.tripId, tripId),
        eq(tripReservations.id, reservationId),
      ),
    )
    .limit(1);

  return row ? toReservation(row) : undefined;
}

function toReservation(row: ReservationRow): TripReservation {
  const transport =
    row.transportMode && row.originName && row.destinationName
      ? {
          destinationName: row.destinationName,
          mode: row.transportMode,
          operatorName: row.operatorName,
          originName: row.originName,
          serviceNumber: row.serviceNumber,
        }
      : null;

  return {
    confirmationCode: row.confirmationCode,
    createdAt: row.createdAt.toISOString(),
    endDate: row.endDate,
    endTime: row.endTime?.slice(0, 5) ?? null,
    id: row.id,
    itineraryItemId: row.itineraryItemId,
    kind: row.kind,
    locationName: row.locationName,
    notes: row.notes,
    providerName: row.providerName,
    startDate: row.startDate,
    startTime: row.startTime?.slice(0, 5) ?? null,
    status: row.status,
    title: row.title,
    transport,
    updatedAt: row.updatedAt.toISOString(),
  };
}
