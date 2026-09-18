import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ItineraryItem, TripDay, TripDestination } from "@tripforge/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { tripsApi } from "@/lib/api/trips";
import { renderWithQueryClient } from "@/test-utils";

import { DaysSection } from "./days-section";

const tripId = "11111111-1111-4111-8111-111111111111";
const tokyo: TripDestination = {
  createdAt: "2027-01-01T00:00:00.000Z",
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  latitude: null,
  longitude: null,
  name: "Tokyo",
  position: 0,
  updatedAt: "2027-01-01T00:00:00.000Z",
};
const days: TripDay[] = [
  { date: "2027-04-12", destinationId: tokyo.id, id: "day-1" },
  { date: "2027-04-13", destinationId: null, id: "day-2" },
];
const item: ItineraryItem = {
  createdAt: "2027-01-01T00:00:00.000Z",
  dayId: days[0]!.id,
  id: "item-1",
  kind: "food",
  notes: "Book the terrace",
  place: null,
  position: 0,
  startTime: "19:30",
  title: "Dinner in Shibuya",
  updatedAt: "2027-01-01T00:00:00.000Z",
};

describe("DaysSection", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(tripsApi, "listDestinations").mockResolvedValue([tokyo]);
    vi.spyOn(tripsApi, "listItineraryItems").mockResolvedValue([]);
  });

  it("renders chronological Day numbering and editable selectors", async () => {
    vi.spyOn(tripsApi, "listDays").mockResolvedValue(days);
    renderWithQueryClient(<DaysSection canEdit tripId={tripId} />);

    expect(await screen.findByText("12 Apr 2027")).toBeVisible();
    expect(screen.getByText("13 Apr 2027")).toBeVisible();
    expect(screen.getByText("Day 1")).toBeVisible();
    expect(screen.getByText("Day 2")).toBeVisible();
    expect(screen.getByLabelText("Primary destination for Day 1")).toHaveValue(tokyo.id);
    expect(screen.getByLabelText("Primary destination for Day 2")).toHaveValue("");
  });

  it("renders viewer assignments as plain text", async () => {
    vi.spyOn(tripsApi, "listDays").mockResolvedValue(days);
    vi.spyOn(tripsApi, "listItineraryItems").mockResolvedValue([item]);
    renderWithQueryClient(<DaysSection canEdit={false} tripId={tripId} />);

    expect(
      await screen.findByText((_, element) =>
        element?.textContent === "Primary destination: Tokyo"),
    ).toBeVisible();
    expect(
      screen.getByText((_, element) =>
        element?.textContent === "Primary destination: Not assigned"),
    ).toBeVisible();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.getByText("Dinner in Shibuya")).toBeVisible();
    expect(screen.getByText("19:30")).toBeVisible();
    expect(screen.queryByRole("button", { name: /Move/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Edit/ })).not.toBeInTheDocument();
  });

  it("reassigns a Day and safely reports mutation failures", async () => {
    vi.spyOn(tripsApi, "listDays").mockResolvedValue(days);
    const update = vi.spyOn(tripsApi, "updateDay")
      .mockResolvedValueOnce({ ...days[1]!, destinationId: tokyo.id })
      .mockRejectedValueOnce(new TypeError("database detail"));
    const user = userEvent.setup();
    renderWithQueryClient(<DaysSection canEdit tripId={tripId} />);

    const second = await screen.findByLabelText("Primary destination for Day 2");
    await user.selectOptions(second, tokyo.id);
    expect(update).toHaveBeenCalledWith(tripId, days[1]!.id, {
      destinationId: tokyo.id,
    });
    await user.selectOptions(screen.getByLabelText("Primary destination for Day 1"), "");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Unable to update the Day destination. Please try again.",
    );
    expect(screen.queryByText("database detail")).not.toBeInTheDocument();
  });

  it.each([
    [true, "Set both trip dates to build your itinerary."],
    [false, "Trip dates have not been finalized yet."],
  ] as const)("renders the incomplete-date state for canEdit=%s", async (canEdit, message) => {
    vi.spyOn(tripsApi, "listDays").mockResolvedValue([]);
    renderWithQueryClient(<DaysSection canEdit={canEdit} tripId={tripId} />);

    expect(await screen.findByText(message)).toBeVisible();
  });

  it("creates an item with normalized optional values", async () => {
    vi.spyOn(tripsApi, "listDays").mockResolvedValue(days);
    const create = vi.spyOn(tripsApi, "createItineraryItem").mockResolvedValue(item);
    const user = userEvent.setup();
    renderWithQueryClient(<DaysSection canEdit tripId={tripId} />);

    await user.click(await screen.findByRole("button", { name: "Add item to Day 1" }));
    await user.type(screen.getByLabelText("Title"), "  Dinner in Shibuya  ");
    await user.selectOptions(screen.getByLabelText("Type"), "food");
    await user.type(screen.getByLabelText("Start time"), "19:30");
    await user.type(screen.getByLabelText("Notes"), "   ");
    await user.click(screen.getByRole("button", { name: "Add item" }));

    expect(create).toHaveBeenCalledWith(tripId, {
      dayId: days[0]!.id,
      kind: "food",
      notes: null,
      place: null,
      startTime: "19:30",
      title: "Dinner in Shibuya",
    });
  });

  it("shows item actions and a dedicated move handle to editors", async () => {
    vi.spyOn(tripsApi, "listDays").mockResolvedValue(days);
    vi.spyOn(tripsApi, "listItineraryItems").mockResolvedValue([item]);
    renderWithQueryClient(<DaysSection canEdit tripId={tripId} />);

    expect(await screen.findByRole("button", { name: "Move “Dinner in Shibuya”" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Edit “Dinner in Shibuya”" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Delete “Dinner in Shibuya”" })).toBeVisible();
  });

  it("synchronizes a located item card with shared map selection", async () => {
    vi.spyOn(tripsApi, "listDays").mockResolvedValue(days);
    const locatedItem: ItineraryItem = {
      ...item,
      place: {
        address: "Asakusa, Tokyo",
        latitude: 35.7148,
        longitude: 139.7967,
        name: "Senso-ji",
        provider: "maptiler",
        providerReference: "poi.123",
      },
    };
    vi.spyOn(tripsApi, "listItineraryItems").mockResolvedValue([locatedItem]);
    const onSelectMapPoint = vi.fn();
    renderWithQueryClient(
      <DaysSection
        canEdit
        selectedMapPoint={{ id: item.id, type: "itinerary" }}
        tripId={tripId}
        onSelectMapPoint={onSelectMapPoint}
      />,
    );
    const user = userEvent.setup();

    const card = (await screen.findByText("Dinner in Shibuya")).closest("article")!;
    expect(card).toHaveClass("ring-2");
    expect(within(card).getByText("Senso-ji", { exact: false })).toBeVisible();
    await user.click(within(card).getByRole("button", { name: "Show on map" }));
    expect(onSelectMapPoint).toHaveBeenCalledWith({
      id: item.id,
      type: "itinerary",
    });
  });

  it("edits an item inline and sends normalized form values", async () => {
    vi.spyOn(tripsApi, "listDays").mockResolvedValue(days);
    vi.spyOn(tripsApi, "listItineraryItems").mockResolvedValue([item]);
    const update = vi.spyOn(tripsApi, "updateItineraryItem").mockResolvedValue({
      ...item,
      title: "Supper in Shibuya",
    });
    const user = userEvent.setup();
    renderWithQueryClient(<DaysSection canEdit tripId={tripId} />);

    await user.click(await screen.findByRole("button", { name: "Edit “Dinner in Shibuya”" }));
    const title = screen.getByLabelText("Title");
    await user.clear(title);
    await user.type(title, "  Supper in Shibuya  ");
    await user.click(screen.getByRole("button", { name: "Save item" }));

    await waitFor(() =>
      expect(update).toHaveBeenCalledWith(tripId, item.id, {
        kind: "food",
        notes: "Book the terrace",
        place: null,
        startTime: "19:30",
        title: "Supper in Shibuya",
      }),
    );
  });

  it("requires delete confirmation and safely reports a failed delete", async () => {
    vi.spyOn(tripsApi, "listDays").mockResolvedValue(days);
    vi.spyOn(tripsApi, "listItineraryItems").mockResolvedValue([item]);
    const remove = vi.spyOn(tripsApi, "removeItineraryItem")
      .mockRejectedValueOnce(new TypeError("database detail"))
      .mockResolvedValueOnce();
    const user = userEvent.setup();
    renderWithQueryClient(<DaysSection canEdit tripId={tripId} />);

    await user.click(await screen.findByRole("button", { name: "Delete “Dinner in Shibuya”" }));
    const confirmation = screen.getByRole("group", {
      name: "Confirm deletion of Dinner in Shibuya",
    });
    expect(within(confirmation).getByText("Delete “Dinner in Shibuya”?"))
      .toBeVisible();
    expect(remove).not.toHaveBeenCalled();

    await user.click(within(confirmation).getByRole("button", { name: "Delete" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Unable to delete the itinerary item. Please try again.",
    );
    expect(screen.queryByText("database detail")).not.toBeInTheDocument();

    await user.click(within(confirmation).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(remove).toHaveBeenCalledTimes(2));
    expect(
      screen.queryByRole("group", { name: "Confirm deletion of Dinner in Shibuya" }),
    ).not.toBeInTheDocument();
  });
});
