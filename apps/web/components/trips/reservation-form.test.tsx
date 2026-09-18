import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  emptyReservationForm,
  toCreateReservationRequest,
} from "@/lib/trips/reservation-form-values";
import { reservationFormSchema } from "@/lib/trips/reservation-schema";
import { renderWithQueryClient } from "@/test-utils";

import { ReservationForm } from "./reservation-form";

const days = [{ date: "2027-04-12", destinationId: null, id: "day" }];
const items = [{
  createdAt: "2027-01-01T00:00:00.000Z",
  dayId: "day",
  id: "item",
  kind: "food" as const,
  notes: null,
  place: null,
  position: 0,
  startTime: "19:30",
  title: "Dinner at Sushi Dai",
  updatedAt: "2027-01-01T00:00:00.000Z",
}];

describe("ReservationForm", () => {
  it("shows contextual itinerary options and submits accommodation", async () => {
    const user = userEvent.setup();
    const submit = vi.fn().mockResolvedValue(undefined);
    renderWithQueryClient(
      <ReservationForm
        cancelHref="/reservations"
        days={days}
        defaultValues={emptyReservationForm("2027-04-12")}
        isPending={false}
        items={items}
        onSubmit={submit}
        submitLabel="Create reservation"
      />,
    );
    expect(screen.getByRole("option", { name: "Day 1 · 19:30 · Dinner at Sushi Dai" })).toBeVisible();
    await user.type(screen.getByRole("textbox", { name: "Title" }), "Hotel");
    await user.selectOptions(screen.getByLabelText("Linked itinerary item"), "item");
    await user.click(screen.getByRole("button", { name: "Create reservation" }));
    expect(submit).toHaveBeenCalledWith(
      expect.objectContaining({ itineraryItemId: "item", title: "Hotel" }),
      expect.anything(),
    );
  });

  it("shows and requires typed transport fields conditionally", async () => {
    const user = userEvent.setup();
    const submit = vi.fn().mockResolvedValue(undefined);
    renderWithQueryClient(
      <ReservationForm
        cancelHref="/reservations"
        days={[]}
        defaultValues={emptyReservationForm("2027-04-12")}
        isPending={false}
        items={[]}
        onSubmit={submit}
        submitLabel="Create reservation"
      />,
    );
    await user.selectOptions(screen.getByLabelText("Kind"), "transport");
    expect(screen.getByRole("group", { name: "Transport details" })).toBeVisible();
    await user.type(screen.getByRole("textbox", { name: "Title" }), "Train");
    await user.click(screen.getByRole("button", { name: "Create reservation" }));
    expect(await screen.findByText("Enter an origin.")).toBeVisible();
    expect(screen.getByText("Enter a destination.")).toBeVisible();
    expect(submit).not.toHaveBeenCalled();
  });

  it("does not send stale hidden transport details after kind switching", () => {
    const values = emptyReservationForm("2027-04-12");
    values.title = "Dinner";
    values.kind = "restaurant";
    values.transport.originName = "Tokyo";
    values.transport.destinationName = "Kyoto";
    expect(toCreateReservationRequest(values).transport).toBeNull();
  });

  it("strictly validates local schedule combinations", () => {
    const values = emptyReservationForm("2027-04-14");
    values.title = "Dinner";
    values.startTime = "19:30";
    values.endTime = "18:00";
    expect(reservationFormSchema.safeParse(values).success).toBe(false);
    values.endDate = "2027-04-14";
    expect(reservationFormSchema.safeParse(values).success).toBe(false);
    values.endTime = "20:00";
    expect(reservationFormSchema.safeParse(values).success).toBe(true);
  });
});
