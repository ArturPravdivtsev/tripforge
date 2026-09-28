import { HttpException, HttpStatus, Injectable } from "@nestjs/common";
import type {
  CreateTripReservationRequest,
  TransportReservationDetails,
  TripReservation,
  UpdateTripReservationRequest,
} from "@tripforge/contracts";

import { TripRealtimePublisher } from "../realtime/trip-realtime.publisher";
import { TripPermissionsService } from "./trip-permissions.service";
import {
  type ReservationState,
  TripReservationsRepository,
} from "./trip-reservations.repository";

@Injectable()
export class TripReservationsService {
  constructor(
    private readonly reservations: TripReservationsRepository,
    private readonly permissions: TripPermissionsService,
    private readonly realtime: TripRealtimePublisher,
  ) {}

  async list(userId: string, tripId: string): Promise<TripReservation[]> {
    await this.permissions.requireReadable(userId, tripId);
    return this.reservations.list(tripId);
  }

  async get(
    userId: string,
    tripId: string,
    reservationId: string,
  ): Promise<TripReservation> {
    await this.permissions.requireReadable(userId, tripId);
    const reservation = await this.reservations.find(tripId, reservationId);
    if (!reservation) throw reservationNotFound();
    return reservation;
  }

  async create(
    userId: string,
    tripId: string,
    input: CreateTripReservationRequest,
  ): Promise<TripReservation> {
    await this.permissions.requireEditable(userId, tripId);
    const state = normalizeReservationState({
      confirmationCode: input.confirmationCode ?? null,
      endDate: input.endDate ?? null,
      endTime: input.endTime ?? null,
      itineraryItemId: input.itineraryItemId ?? null,
      kind: input.kind,
      locationName: input.locationName ?? null,
      notes: input.notes ?? null,
      providerName: input.providerName ?? null,
      startDate: input.startDate,
      startTime: input.startTime ?? null,
      status: input.status,
      title: input.title,
      transport: input.transport ?? null,
    });

    validateReservationState(state);
    await this.validateItineraryLink(tripId, state.itineraryItemId);
    const { notificationUserIds, reservation } = await this.reservations.create(
      tripId,
      userId,
      state,
    );
    this.realtime.invalidate(tripId, ["reservations"]);
    this.realtime.notificationsChanged(notificationUserIds);
    return reservation;
  }

  async update(
    userId: string,
    tripId: string,
    reservationId: string,
    input: UpdateTripReservationRequest,
  ): Promise<TripReservation> {
    await this.permissions.requireEditable(userId, tripId);
    if (!Object.values(input).some((value) => value !== undefined)) {
      throw reservationError(
        "EMPTY_RESERVATION_UPDATE",
        "Provide at least one reservation field to update",
        HttpStatus.BAD_REQUEST,
      );
    }

    const existing = await this.reservations.find(tripId, reservationId);
    if (!existing) throw reservationNotFound();

    const kind = input.kind ?? existing.kind;
    const suppliedTransport = Object.prototype.hasOwnProperty.call(
      input,
      "transport",
    );
    let transport = suppliedTransport ? (input.transport ?? null) : existing.transport;
    if (kind !== "transport" && !suppliedTransport) transport = null;

    const state = normalizeReservationState({
      confirmationCode:
        input.confirmationCode === undefined
          ? existing.confirmationCode
          : input.confirmationCode,
      endDate: input.endDate === undefined ? existing.endDate : input.endDate,
      endTime: input.endTime === undefined ? existing.endTime : input.endTime,
      itineraryItemId:
        input.itineraryItemId === undefined
          ? existing.itineraryItemId
          : input.itineraryItemId,
      kind,
      locationName:
        input.locationName === undefined
          ? existing.locationName
          : input.locationName,
      notes: input.notes === undefined ? existing.notes : input.notes,
      providerName:
        input.providerName === undefined
          ? existing.providerName
          : input.providerName,
      startDate: input.startDate ?? existing.startDate,
      startTime:
        input.startTime === undefined ? existing.startTime : input.startTime,
      status: input.status ?? existing.status,
      title: input.title ?? existing.title,
      transport,
    });

    validateReservationState(state);
    await this.validateItineraryLink(tripId, state.itineraryItemId);
    const reservation = await this.reservations.update(
      tripId,
      reservationId,
      state,
    );
    if (!reservation) throw reservationNotFound();
    this.realtime.invalidate(tripId, ["reservations"]);
    return reservation;
  }

  async delete(
    userId: string,
    tripId: string,
    reservationId: string,
  ): Promise<void> {
    await this.permissions.requireEditable(userId, tripId);
    if (!(await this.reservations.delete(tripId, reservationId))) {
      throw reservationNotFound();
    }
    this.realtime.invalidate(tripId, ["reservations"]);
  }

  private async validateItineraryLink(
    tripId: string,
    itineraryItemId: string | null,
  ): Promise<void> {
    if (
      itineraryItemId &&
      !(await this.reservations.itineraryItemBelongsToTrip(
        tripId,
        itineraryItemId,
      ))
    ) {
      throw reservationError(
        "ITINERARY_ITEM_NOT_FOUND",
        "Itinerary item not found",
        HttpStatus.NOT_FOUND,
      );
    }
  }
}

export function normalizeReservationState(
  state: ReservationState,
): ReservationState {
  return {
    ...state,
    confirmationCode: normalizeNullable(state.confirmationCode),
    locationName: normalizeNullable(state.locationName),
    notes: normalizeNullable(state.notes),
    providerName: normalizeNullable(state.providerName),
    title: state.title.trim(),
    transport: normalizeTransport(state.transport),
  };
}

export function validateReservationState(state: ReservationState): void {
  const validTransport =
    state.transport !== null &&
    state.transport.originName.length > 0 &&
    state.transport.destinationName.length > 0;

  if (
    (state.kind === "transport" && !validTransport) ||
    (state.kind !== "transport" && state.transport !== null)
  ) {
    throw reservationError(
      "INVALID_RESERVATION_DETAILS",
      "Transport details must match the reservation kind",
      HttpStatus.BAD_REQUEST,
    );
  }

  if (
    (state.endTime !== null && state.endDate === null) ||
    (state.endDate !== null && state.endDate < state.startDate) ||
    (state.endDate === state.startDate &&
      state.startTime !== null &&
      state.endTime !== null &&
      state.endTime < state.startTime)
  ) {
    throw reservationError(
      "INVALID_RESERVATION_SCHEDULE",
      "Reservation end date and time must not precede its start",
      HttpStatus.BAD_REQUEST,
    );
  }
}

function normalizeNullable(value: string | null): string | null {
  return value?.trim() || null;
}

function normalizeTransport(
  transport: TransportReservationDetails | null,
): TransportReservationDetails | null {
  if (!transport) return null;
  return {
    destinationName: transport.destinationName.trim(),
    mode: transport.mode,
    operatorName: normalizeNullable(transport.operatorName),
    originName: transport.originName.trim(),
    serviceNumber: normalizeNullable(transport.serviceNumber),
  };
}

function reservationNotFound() {
  return reservationError(
    "RESERVATION_NOT_FOUND",
    "Reservation not found",
    HttpStatus.NOT_FOUND,
  );
}

function reservationError(code: string, message: string, status: HttpStatus) {
  return new HttpException({ code, message }, status);
}
