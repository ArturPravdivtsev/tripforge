import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Trip, TripSearchResponse } from "@tripforge/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { tripsApi } from "@/lib/api/trips";
import { renderWithQueryClient } from "@/test-utils";

import { TripSearchScreen } from "./trip-search-screen";

const trip: Trip = {
  accessRole: "viewer",
  createdAt: "2027-01-01T00:00:00.000Z",
  endsOn: "2027-04-16",
  id: "11111111-1111-4111-8111-111111111111",
  name: "Japan",
  startsOn: "2027-04-12",
  updatedAt: "2027-01-01T00:00:00.000Z",
};

const response: TripSearchResponse = {
  query: "Kyoto",
  results: [
    {
      context: { latitude: 35.0116, longitude: 135.7681 },
      id: "22222222-2222-4222-8222-222222222222",
      subtitle: "Destination",
      target: { tripId: trip.id, type: "trip" },
      title: "Kyoto",
      type: "destination",
    },
  ],
};

describe("TripSearchScreen", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(tripsApi, "get").mockResolvedValue(trip);
    vi.spyOn(tripsApi, "search").mockResolvedValue(response);
  });

  it("debounces search, renders semantic results, and navigates by typed target", async () => {
    const user = userEvent.setup();
    const search = vi.spyOn(tripsApi, "search");
    renderWithQueryClient(<TripSearchScreen tripId={trip.id} />);

    const input = await screen.findByRole("searchbox", { name: "Search this trip" });
    await user.type(input, "Kyoto");
    expect(screen.getByText("Searching…")).toBeVisible();
    await waitFor(() => expect(search).toHaveBeenCalledTimes(1), { timeout: 1_000 });
    expect(search).toHaveBeenCalledWith(
      trip.id,
      { q: "Kyoto", types: undefined },
      { signal: expect.any(AbortSignal) },
    );
    expect(await screen.findByRole("link", { name: /Kyoto/ })).toHaveAttribute(
      "href",
      `/trips/${trip.id}`,
    );
    expect(screen.getByRole("status")).toHaveTextContent("1 results");
  });

  it("keeps short queries local and applies a resource filter", async () => {
    const user = userEvent.setup();
    const search = vi.spyOn(tripsApi, "search");
    renderWithQueryClient(<TripSearchScreen tripId={trip.id} />);
    const input = await screen.findByRole("searchbox", { name: "Search this trip" });

    await user.type(input, "K");
    expect(screen.getByText("Type at least 2 characters to search this trip.")).toBeVisible();
    expect(search).not.toHaveBeenCalled();
    await user.type(input, "yoto");
    await waitFor(() => expect(search).toHaveBeenCalledTimes(1), { timeout: 1_000 });
    await user.click(screen.getByRole("button", { name: "Destinations" }));
    await waitFor(() => expect(search).toHaveBeenCalledTimes(2));
    expect(search).toHaveBeenLastCalledWith(
      trip.id,
      { q: "Kyoto", types: ["destination"] },
      { signal: expect.any(AbortSignal) },
    );
  });
});
