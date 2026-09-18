import type {
  CreateTripReservationRequest,
  TransportReservationDetails,
  TripReservation,
  UpdateTripReservationRequest,
} from "@tripforge/contracts";

import {
  reservationFormSchema,
  type ReservationFormValues,
} from "./reservation-schema";

export function emptyReservationForm(startDate = ""): ReservationFormValues {
  return {
    confirmationCode: "",
    endDate: "",
    endTime: "",
    itineraryItemId: "",
    kind: "accommodation",
    locationName: "",
    notes: "",
    providerName: "",
    startDate,
    startTime: "",
    status: "pending",
    title: "",
    transport: {
      destinationName: "",
      mode: "train",
      operatorName: "",
      originName: "",
      serviceNumber: "",
    },
  };
}

export function reservationToFormValues(
  reservation: TripReservation,
): ReservationFormValues {
  return {
    confirmationCode: reservation.confirmationCode ?? "",
    endDate: reservation.endDate ?? "",
    endTime: reservation.endTime ?? "",
    itineraryItemId: reservation.itineraryItemId ?? "",
    kind: reservation.kind,
    locationName: reservation.locationName ?? "",
    notes: reservation.notes ?? "",
    providerName: reservation.providerName ?? "",
    startDate: reservation.startDate,
    startTime: reservation.startTime ?? "",
    status: reservation.status,
    title: reservation.title,
    transport: reservation.transport
      ? {
          destinationName: reservation.transport.destinationName,
          mode: reservation.transport.mode,
          operatorName: reservation.transport.operatorName ?? "",
          originName: reservation.transport.originName,
          serviceNumber: reservation.transport.serviceNumber ?? "",
        }
      : emptyReservationForm().transport,
  };
}

export function toCreateReservationRequest(
  values: ReservationFormValues,
): CreateTripReservationRequest {
  const parsed = reservationFormSchema.parse(values);
  return {
    confirmationCode: nullable(parsed.confirmationCode),
    endDate: nullable(parsed.endDate),
    endTime: nullable(parsed.endTime),
    itineraryItemId: nullable(parsed.itineraryItemId),
    kind: parsed.kind,
    locationName: nullable(parsed.locationName),
    notes: nullable(parsed.notes),
    providerName: nullable(parsed.providerName),
    startDate: parsed.startDate,
    startTime: nullable(parsed.startTime),
    status: parsed.status,
    title: parsed.title,
    transport: parsed.kind === "transport" ? transportDetails(parsed.transport) : null,
  };
}

export function toUpdateReservationRequest(
  values: ReservationFormValues,
): UpdateTripReservationRequest {
  return toCreateReservationRequest(values);
}

function nullable(value: string): string | null {
  return value.trim() || null;
}

function transportDetails(
  transport: ReservationFormValues["transport"],
): TransportReservationDetails {
  return {
    destinationName: transport.destinationName.trim(),
    mode: transport.mode,
    operatorName: nullable(transport.operatorName),
    originName: transport.originName.trim(),
    serviceNumber: nullable(transport.serviceNumber),
  };
}
