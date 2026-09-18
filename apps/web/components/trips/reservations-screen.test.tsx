import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Trip, TripReservation } from "@tripforge/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiClientError } from "@/lib/api/errors";
import { tripsApi } from "@/lib/api/trips";
import { renderWithQueryClient } from "@/test-utils";

import { ReservationsScreen } from "./reservations-screen";

const trip: Trip = {
  accessRole: "owner",
  createdAt: "2027-01-01T00:00:00.000Z",
  endsOn: "2027-04-16",
  id: "11111111-1111-4111-8111-111111111111",
  name: "Japan",
  startsOn: "2027-04-12",
  updatedAt: "2027-01-01T00:00:00.000Z",
};
const reservation: TripReservation = {
  confirmationCode: "XYZ789",
  createdAt: "2027-01-01T00:00:00.000Z",
  endDate: null,
  endTime: null,
  id: "22222222-2222-4222-8222-222222222222",
  itineraryItemId: null,
  kind: "transport",
  locationName: null,
  notes: null,
  providerName: "JR Central",
  startDate: "2027-04-11",
  startTime: "08:03",
  status: "cancelled",
  title: "Shinkansen Tokyo → Kyoto",
  transport: {
    destinationName: "Kyoto Station",
    mode: "train",
    operatorName: "JR Central",
    originName: "Tokyo Station",
    serviceNumber: "Nozomi 215",
  },
  updatedAt: "2027-01-01T00:00:00.000Z",
};

describe("ReservationsScreen", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(tripsApi, "get").mockResolvedValue(trip);
    vi.spyOn(tripsApi, "listReservations").mockResolvedValue([reservation]);
  });

  it("shows loading state while reservations are pending", () => {
    vi.spyOn(tripsApi, "listReservations").mockImplementation(
      () => new Promise(() => undefined),
    );
    renderWithQueryClient(<ReservationsScreen tripId={trip.id} />);
    expect(screen.getByRole("status", { name: "Loading reservations…" })).toBeVisible();
  });

  it("renders transport, cancelled, outside-range, and confirmation details", async () => {
    renderWithQueryClient(<ReservationsScreen tripId={trip.id} />);
    expect(await screen.findByText(reservation.title)).toBeVisible();
    expect(screen.getByText("Cancelled")).toBeVisible();
    expect(screen.getByText("Tokyo Station → Kyoto Station")).toBeVisible();
    expect(screen.getByText("JR Central · Nozomi 215")).toBeVisible();
    expect(screen.getByText("Confirmation: XYZ789")).toBeVisible();
    expect(screen.getByText("Outside trip dates")).toBeVisible();
    expect(screen.getByText("Not linked to itinerary")).toBeVisible();
  });

  it("shows empty viewer state without mutation controls", async () => {
    vi.spyOn(tripsApi, "get").mockResolvedValue({ ...trip, accessRole: "viewer" });
    vi.spyOn(tripsApi, "listReservations").mockResolvedValue([]);
    renderWithQueryClient(<ReservationsScreen tripId={trip.id} />);
    expect(await screen.findByText("No reservations yet.")).toBeVisible();
    expect(screen.queryByRole("link", { name: "New reservation" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete record" })).not.toBeInTheDocument();
  });

  it.each([
    [401, "UNAUTHENTICATED", "Sign in to view reservations."],
    [404, "TRIP_NOT_FOUND", "Trip not found"],
  ] as const)("shows controlled %s state", async (status, code, title) => {
    vi.spyOn(tripsApi, "get").mockRejectedValue(
      new ApiClientError("backend detail", status, code),
    );
    renderWithQueryClient(<ReservationsScreen tripId={trip.id} />);
    expect(await screen.findByText(title)).toBeVisible();
    expect(screen.queryByText("backend detail")).not.toBeInTheDocument();
  });

  it("confirms cancellation and explains local-only semantics", async () => {
    const user = userEvent.setup();
    const active = { ...reservation, status: "confirmed" as const };
    vi.spyOn(tripsApi, "listReservations").mockResolvedValue([active]);
    const update = vi
      .spyOn(tripsApi, "updateReservation")
      .mockResolvedValue({ ...active, status: "cancelled" });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    renderWithQueryClient(<ReservationsScreen tripId={trip.id} />);

    await user.click(await screen.findByRole("button", { name: "Cancel booking" }));
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("does not contact the provider"));
    expect(update).toHaveBeenCalledWith(trip.id, active.id, { status: "cancelled" });
  });

  it("distinguishes delete, supports cancelled confirmation, and reports failure", async () => {
    const user = userEvent.setup();
    const remove = vi.spyOn(tripsApi, "removeReservation").mockRejectedValue(
      new Error("database detail"),
    );
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    renderWithQueryClient(<ReservationsScreen tripId={trip.id} />);

    const button = await screen.findByRole("button", { name: "Delete record" });
    await user.click(button);
    expect(remove).not.toHaveBeenCalled();
    await user.click(button);
    expect(confirm).toHaveBeenLastCalledWith(expect.stringContaining("does not cancel the provider booking"));
    await waitFor(() => expect(remove).toHaveBeenCalledWith(trip.id, reservation.id));
    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to delete reservation");
  });

  it("deletes after explicit confirmation", async () => {
    const user = userEvent.setup();
    const remove = vi.spyOn(tripsApi, "removeReservation").mockResolvedValue();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderWithQueryClient(<ReservationsScreen tripId={trip.id} />);
    await user.click(await screen.findByRole("button", { name: "Delete record" }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith(trip.id, reservation.id));
  });

  it("shows a recoverable generic server state", async () => {
    vi.spyOn(tripsApi, "listReservations").mockRejectedValue(new Error("offline"));
    renderWithQueryClient(<ReservationsScreen tripId={trip.id} />);
    expect(await screen.findByText("Unable to load reservations.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Try again" })).toBeVisible();
  });
});
