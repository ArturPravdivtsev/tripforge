import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { TripDay, TripDestination } from "@tripforge/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { tripsApi } from "@/lib/api/trips";
import { renderWithQueryClient } from "@/test-utils";

import { DaysSection } from "./days-section";

const tripId = "11111111-1111-4111-8111-111111111111";
const tokyo: TripDestination = {
  createdAt: "2027-01-01T00:00:00.000Z",
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  name: "Tokyo",
  position: 0,
  updatedAt: "2027-01-01T00:00:00.000Z",
};
const days: TripDay[] = [
  { date: "2027-04-12", destinationId: tokyo.id, id: "day-1" },
  { date: "2027-04-13", destinationId: null, id: "day-2" },
];

describe("DaysSection", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(tripsApi, "listDestinations").mockResolvedValue([tokyo]);
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
    [true, "Set both trip dates to build your day plan."],
    [false, "Trip dates have not been finalized yet."],
  ] as const)("renders the incomplete-date state for canEdit=%s", async (canEdit, message) => {
    vi.spyOn(tripsApi, "listDays").mockResolvedValue([]);
    renderWithQueryClient(<DaysSection canEdit={canEdit} tripId={tripId} />);

    expect(await screen.findByText(message)).toBeVisible();
  });
});
