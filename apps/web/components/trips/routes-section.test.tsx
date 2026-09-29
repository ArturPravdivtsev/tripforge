import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {
  ItineraryItem,
  TripDay,
  TripRouteSegment,
} from "@tripforge/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { tripsApi } from "@/lib/api/trips";
import { renderWithQueryClient } from "@/test-utils";
import { expectNoAxeViolations } from "@/test/accessibility";

import { RoutesSection } from "./routes-section";

const tripId = "11111111-1111-4111-8111-111111111111";
const days: TripDay[] = [{ date: "2027-04-12", destinationId: null, id: "day" }];
const items: ItineraryItem[] = [
  {
    createdAt: "2027-01-01T00:00:00.000Z", dayId: "day", id: "from", kind: "activity", notes: null,
    place: { address: "Asakusa", latitude: 35.7, longitude: 139.7, name: "Senso-ji", provider: "maptiler", providerReference: null },
    position: 0, startTime: "09:00", title: "Temple", updatedAt: "2027-01-01T00:00:00.000Z",
  },
  {
    createdAt: "2027-01-01T00:00:00.000Z", dayId: "day", id: "to", kind: "activity", notes: null,
    place: { address: "Sumida", latitude: 35.8, longitude: 139.8, name: "Tokyo Skytree", provider: "maptiler", providerReference: null },
    position: 1, startTime: "14:00", title: "Tower", updatedAt: "2027-01-01T00:00:00.000Z",
  },
];
const route: TripRouteSegment = {
  createdAt: "2027-01-01T00:00:00.000Z", distanceMeters: 2400, durationSeconds: 1860,
  fromItemId: "from", geometry: { coordinates: [[139.7, 35.7], [139.8, 35.8]], type: "LineString" },
  id: "route", mode: "walking", toItemId: "to", updatedAt: "2027-01-01T00:00:00.000Z",
};

describe("RoutesSection", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(tripsApi, "listRoutes").mockResolvedValue([route]);
    vi.spyOn(tripsApi, "listItineraryItems").mockResolvedValue(items);
    vi.spyOn(tripsApi, "listDays").mockResolvedValue(days);
  });

  it("shows summaries and hides mutations from viewers", async () => {
    const { container } = renderWithQueryClient(<RoutesSection canEdit={false} tripId={tripId} />);
    expect(await screen.findByText("Walking · 2.4 km · 31 min")).toBeVisible();
    expect(screen.getByText("Senso-ji → Tokyo Skytree")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Recalculate" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Calculate route" })).not.toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it("creates a route from understandable endpoint labels", async () => {
    const user = userEvent.setup();
    vi.spyOn(tripsApi, "listRoutes").mockResolvedValue([]);
    const create = vi.spyOn(tripsApi, "createRoute").mockResolvedValue(route);
    renderWithQueryClient(<RoutesSection canEdit tripId={tripId} />);

    await user.selectOptions(await screen.findByLabelText("From"), "from");
    expect(screen.getAllByRole("option", { name: "Day 1 · 09:00 · Senso-ji" })).toHaveLength(2);
    await user.selectOptions(screen.getByLabelText("To"), "to");
    await user.selectOptions(screen.getByLabelText("Mode"), "walking");
    await user.click(screen.getByRole("button", { name: "Calculate route" }));

    expect(create).toHaveBeenCalledWith(tripId, {
      fromItemId: "from", mode: "walking", toItemId: "to",
    });
    expect(await screen.findByText("Walking · 2.4 km · 31 min")).toBeVisible();
  });

  it("isolates provider errors and retains the editor", async () => {
    const user = userEvent.setup();
    vi.spyOn(tripsApi, "listRoutes").mockResolvedValue([]);
    vi.spyOn(tripsApi, "createRoute").mockRejectedValue(new Error("provider detail"));
    renderWithQueryClient(<RoutesSection canEdit tripId={tripId} />);
    await user.selectOptions(await screen.findByLabelText("From"), "from");
    await user.selectOptions(screen.getByLabelText("To"), "to");
    await user.click(screen.getByRole("button", { name: "Calculate route" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not calculate this route right now");
    expect(screen.getByLabelText("From")).toBeVisible();
  });

  it("recalculates mode and confirms deletion", async () => {
    const user = userEvent.setup();
    const update = vi.spyOn(tripsApi, "updateRoute").mockResolvedValue({
      ...route,
      mode: "cycling",
    });
    const remove = vi.spyOn(tripsApi, "removeRoute").mockResolvedValue();
    renderWithQueryClient(<RoutesSection canEdit tripId={tripId} />);

    const mode = await screen.findByLabelText(/Mode for route from/);
    await user.selectOptions(mode, "cycling");
    expect(update).toHaveBeenCalledWith(tripId, route.id, { mode: "cycling" });
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.click(screen.getByRole("button", { name: "Confirm delete" }));
    expect(remove).toHaveBeenCalledWith(tripId, route.id);
    expect(screen.queryByText("Cycling · 2.4 km · 31 min")).not.toBeInTheDocument();
  });
});
