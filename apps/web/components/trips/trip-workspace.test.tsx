import { screen } from "@testing-library/react";
import type { Trip } from "@tripforge/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiClientError } from "@/lib/api/errors";
import { tripsApi } from "@/lib/api/trips";
import { renderWithQueryClient } from "@/test-utils";

import { TripWorkspace } from "./trip-workspace";

const trip: Trip = {
  accessRole: "owner",
  createdAt: "2027-01-01T00:00:00.000Z",
  endsOn: "2027-04-13",
  id: "11111111-1111-4111-8111-111111111111",
  name: "Japan 2027",
  startsOn: "2027-04-12",
  updatedAt: "2027-01-01T00:00:00.000Z",
};

describe("TripWorkspace", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(tripsApi, "listDestinations").mockResolvedValue([]);
    vi.spyOn(tripsApi, "listDays").mockResolvedValue([]);
  });

  it("renders loading then the complete Trip workspace", async () => {
    let resolveTrip: ((value: Trip) => void) | undefined;
    vi.spyOn(tripsApi, "get").mockImplementation(
      () => new Promise((resolve) => (resolveTrip = resolve)),
    );
    renderWithQueryClient(<TripWorkspace tripId={trip.id} />);

    expect(
      screen.getByRole("status", { name: "Loading trip workspace" }),
    ).toBeVisible();
    resolveTrip?.(trip);

    expect(await screen.findByRole("heading", { name: "Japan 2027" })).toBeVisible();
    expect(screen.getByText("12 Apr 2027 – 13 Apr 2027")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Destinations" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Days" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Edit" })).toHaveAttribute(
      "href",
      `/trips/${trip.id}/edit`,
    );
    expect(screen.getByRole("link", { name: "Members" })).toHaveAttribute(
      "href",
      `/trips/${trip.id}/members`,
    );
  });

  it("gives editors full destination/day controls", async () => {
    vi.spyOn(tripsApi, "get").mockResolvedValue({ ...trip, accessRole: "editor" });
    renderWithQueryClient(<TripWorkspace tripId={trip.id} />);

    expect(await screen.findByText("editor")).toBeVisible();
    expect(
      await screen.findByRole("button", { name: "Add destination" }),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Edit" })).toBeVisible();
  });

  it("renders an intentional read-only viewer workspace", async () => {
    vi.spyOn(tripsApi, "get").mockResolvedValue({ ...trip, accessRole: "viewer" });
    renderWithQueryClient(<TripWorkspace tripId={trip.id} />);

    expect(await screen.findByText("viewer")).toBeVisible();
    expect(screen.queryByRole("link", { name: "Edit" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add destination" })).not.toBeInTheDocument();
    expect(
      await screen.findByText("Trip dates have not been finalized yet."),
    ).toBeVisible();
  });

  it.each([
    [401, "Sign in to open this trip."],
    [404, "Trip not found"],
  ] as const)("renders controlled %s state", async (status, message) => {
    vi.spyOn(tripsApi, "get").mockRejectedValue(
      new ApiClientError("backend detail", status, "CONTROLLED"),
    );
    renderWithQueryClient(<TripWorkspace tripId={trip.id} />);

    expect(await screen.findByText(message)).toBeVisible();
  });

  it("offers retry after a Trip request failure", async () => {
    vi.spyOn(tripsApi, "get").mockRejectedValue(new TypeError("offline"));
    renderWithQueryClient(<TripWorkspace tripId={trip.id} />);

    expect(await screen.findByText("Unable to load trip.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Try again" })).toBeVisible();
  });

  it("keeps the Trip header when a nested query fails", async () => {
    vi.spyOn(tripsApi, "get").mockResolvedValue(trip);
    vi.spyOn(tripsApi, "listDestinations").mockRejectedValue(
      new TypeError("offline"),
    );
    renderWithQueryClient(<TripWorkspace tripId={trip.id} />);

    expect(await screen.findByRole("heading", { name: "Japan 2027" })).toBeVisible();
    expect(await screen.findByText("Unable to load destinations.")).toBeVisible();
  });
});
