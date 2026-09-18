import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Trip, TripReservation } from "@tripforge/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { tripsApi } from "@/lib/api/trips";
import { tripKeys } from "@/lib/trips/query-keys";
import { renderWithQueryClient } from "@/test-utils";

import { EditReservationScreen } from "./edit-reservation-screen";
import { NewReservationScreen } from "./new-reservation-screen";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

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
  endDate: "2027-04-14",
  endTime: "10:20",
  id: "22222222-2222-4222-8222-222222222222",
  itineraryItemId: "item",
  kind: "transport",
  locationName: null,
  notes: null,
  providerName: "JR Central",
  startDate: "2027-04-14",
  startTime: "08:03",
  status: "confirmed",
  title: "Shinkansen",
  transport: {
    destinationName: "Kyoto Station",
    mode: "train",
    operatorName: "JR Central",
    originName: "Tokyo Station",
    serviceNumber: "Nozomi 215",
  },
  updatedAt: "2027-01-01T00:00:00.000Z",
};
const days = [{ date: "2027-04-14", destinationId: null, id: "day" }];
const items = [{
  createdAt: "2027-01-01T00:00:00.000Z",
  dayId: "day",
  id: "item",
  kind: "transport" as const,
  notes: null,
  place: null,
  position: 0,
  startTime: "08:03",
  title: "Shinkansen",
  updatedAt: "2027-01-01T00:00:00.000Z",
}];

describe("reservation create and edit screens", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    push.mockReset();
    vi.spyOn(tripsApi, "get").mockResolvedValue(trip);
    vi.spyOn(tripsApi, "listDays").mockResolvedValue(days);
    vi.spyOn(tripsApi, "listItineraryItems").mockResolvedValue(items);
    vi.spyOn(tripsApi, "getReservation").mockResolvedValue(reservation);
  });

  it("creates without an itinerary and navigates after list invalidation", async () => {
    const user = userEvent.setup();
    vi.spyOn(tripsApi, "listItineraryItems").mockResolvedValue([]);
    const create = vi.spyOn(tripsApi, "createReservation").mockResolvedValue({
      ...reservation,
      itineraryItemId: null,
      kind: "accommodation",
      title: "Hotel",
      transport: null,
    });
    const { queryClient } = renderWithQueryClient(
      <NewReservationScreen tripId={trip.id} />,
    );
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    await user.type(await screen.findByRole("textbox", { name: "Title" }), "Hotel");
    await user.click(screen.getByRole("button", { name: "Create reservation" }));

    await waitFor(() =>
      expect(create).toHaveBeenCalledWith(
        trip.id,
        expect.objectContaining({
          itineraryItemId: null,
          kind: "accommodation",
          startDate: "2027-04-12",
          title: "Hotel",
          transport: null,
        }),
      ),
    );
    expect(invalidate).toHaveBeenCalledWith({
      exact: true,
      queryKey: tripKeys.reservations(trip.id),
    });
    expect(push).toHaveBeenCalledWith(`/trips/${trip.id}/reservations`);
  });

  it("blocks new and edit forms for viewers", async () => {
    vi.spyOn(tripsApi, "get").mockResolvedValue({ ...trip, accessRole: "viewer" });
    const { rerender } = renderWithQueryClient(
      <NewReservationScreen tripId={trip.id} />,
    );
    expect(await screen.findByText("You have view-only access to this trip.")).toBeVisible();
    expect(screen.queryByRole("textbox", { name: "Title" })).not.toBeInTheDocument();
    rerender(
      <EditReservationScreen reservationId={reservation.id} tripId={trip.id} />,
    );
    expect(await screen.findByText("You have view-only access to this trip.")).toBeVisible();
  });

  it("hydrates transport once, preserves edits on cache refetch, then unlinks and changes kind", async () => {
    const user = userEvent.setup();
    const updated = { ...reservation, itineraryItemId: null, kind: "activity" as const, transport: null };
    const update = vi.spyOn(tripsApi, "updateReservation").mockResolvedValue(updated);
    const { queryClient } = renderWithQueryClient(
      <EditReservationScreen reservationId={reservation.id} tripId={trip.id} />,
    );
    const title = await screen.findByRole("textbox", { name: "Title" });
    expect(title).toHaveValue("Shinkansen");
    expect(screen.getByRole("textbox", { name: "Origin" })).toHaveValue("Tokyo Station");
    await user.clear(title);
    await user.type(title, "Museum transfer");
    queryClient.setQueryData(tripKeys.reservation(trip.id, reservation.id), {
      ...reservation,
      title: "Background value",
    });
    expect(title).toHaveValue("Museum transfer");

    await user.selectOptions(screen.getByLabelText("Kind"), "activity");
    await user.selectOptions(screen.getByLabelText("Linked itinerary item"), "");
    await user.selectOptions(screen.getByLabelText("Status"), "cancelled");
    await user.click(screen.getByRole("button", { name: "Save reservation" }));
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith(
        trip.id,
        reservation.id,
        expect.objectContaining({
          itineraryItemId: null,
          kind: "activity",
          status: "cancelled",
          title: "Museum transfer",
          transport: null,
        }),
      ),
    );
    expect(queryClient.getQueryData(tripKeys.reservation(trip.id, reservation.id))).toEqual(updated);
    expect(push).toHaveBeenCalledWith(`/trips/${trip.id}/reservations`);
  });

  it("keeps edit values and shows a safe mutation failure", async () => {
    const user = userEvent.setup();
    vi.spyOn(tripsApi, "updateReservation").mockRejectedValue(
      new Error("database detail"),
    );
    renderWithQueryClient(
      <EditReservationScreen reservationId={reservation.id} tripId={trip.id} />,
    );
    const title = await screen.findByRole("textbox", { name: "Title" });
    await user.clear(title);
    await user.type(title, "Edited train");
    await user.click(screen.getByRole("button", { name: "Save reservation" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Unable to save reservation. Please try again.",
    );
    expect(title).toHaveValue("Edited train");
    expect(screen.queryByText("database detail")).not.toBeInTheDocument();
  });
});
