import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { TripDestination } from "@tripforge/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { tripsApi } from "@/lib/api/trips";
import { tripKeys } from "@/lib/trips/query-keys";
import { renderWithQueryClient } from "@/test-utils";

import { DestinationsSection } from "./destinations-section";

vi.mock("../maps/trip-map-panel", () => ({
  TripMapPanel: ({
    editingDestinationId,
    onMapClick,
  }: {
    editingDestinationId?: string;
    onMapClick: (point: { latitude: number; longitude: number }) => void;
  }) => (
    <div data-testid="trip-map-panel">
      {editingDestinationId ? (
        <button
          onClick={() => onMapClick({ latitude: 35.6762, longitude: 139.6503 })}
          type="button"
        >
          Pick Tokyo point
        </button>
      ) : null}
    </div>
  ),
}));

const tripId = "11111111-1111-4111-8111-111111111111";
const destinations: TripDestination[] = [
  {
    createdAt: "2027-01-01T00:00:00.000Z",
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    latitude: null,
    longitude: null,
    name: "Tokyo",
    position: 0,
    updatedAt: "2027-01-01T00:00:00.000Z",
  },
  {
    createdAt: "2027-01-01T00:00:00.000Z",
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    latitude: null,
    longitude: null,
    name: "Kyoto",
    position: 1,
    updatedAt: "2027-01-01T00:00:00.000Z",
  },
];

describe("DestinationsSection", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders editable destinations with correct reorder boundaries", async () => {
    vi.spyOn(tripsApi, "listDestinations").mockResolvedValue(destinations);
    renderWithQueryClient(<DestinationsSection canEdit tripId={tripId} />);

    expect(await screen.findByText("Tokyo")).toBeVisible();
    const moveUp = screen.getAllByRole("button", { name: "Move up" });
    const moveDown = screen.getAllByRole("button", { name: "Move down" });
    expect(moveUp[0]).toBeDisabled();
    expect(moveUp[1]).toBeEnabled();
    expect(moveDown[0]).toBeEnabled();
    expect(moveDown[1]).toBeDisabled();
  });

  it("shows an empty read-only state without mutation controls", async () => {
    vi.spyOn(tripsApi, "listDestinations").mockResolvedValue([]);
    renderWithQueryClient(<DestinationsSection canEdit={false} tripId={tripId} />);

    expect(await screen.findByText("No destinations have been added yet.")).toBeVisible();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("validates and adds a trimmed destination", async () => {
    vi.spyOn(tripsApi, "listDestinations").mockResolvedValue([]);
    const create = vi.spyOn(tripsApi, "createDestination").mockResolvedValue(
      destinations[0]!,
    );
    const user = userEvent.setup();
    renderWithQueryClient(<DestinationsSection canEdit tripId={tripId} />);

    await user.click(await screen.findByRole("button", { name: "Add destination" }));
    expect(await screen.findByText("Enter a destination name.")).toBeVisible();
    await user.type(screen.getByRole("textbox", { name: "Destination name" }), "  Tokyo  ");
    await user.click(screen.getByRole("button", { name: "Add destination" }));

    await waitFor(() =>
      expect(create).toHaveBeenCalledWith(tripId, { name: "Tokyo" }),
    );
  });

  it("renames and reorders destinations", async () => {
    vi.spyOn(tripsApi, "listDestinations").mockResolvedValue(destinations);
    const update = vi.spyOn(tripsApi, "updateDestination").mockResolvedValue({
      ...destinations[0]!,
      name: "Tokyo City",
    });
    const user = userEvent.setup();
    renderWithQueryClient(<DestinationsSection canEdit tripId={tripId} />);

    await screen.findByText("Tokyo");
    await user.click(screen.getAllByRole("button", { name: "Edit" })[0]!);
    const name = screen.getAllByRole("textbox", { name: "Destination name" })[0]!;
    await user.clear(name);
    await user.type(name, "Tokyo City");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(update).toHaveBeenCalledWith(tripId, destinations[0]!.id, {
      name: "Tokyo City",
    });
  });

  it("confirms deletion and invalidates Days", async () => {
    vi.spyOn(tripsApi, "listDestinations").mockResolvedValue(destinations);
    const remove = vi.spyOn(tripsApi, "removeDestination").mockResolvedValue();
    const user = userEvent.setup();
    const { queryClient } = renderWithQueryClient(
      <DestinationsSection canEdit tripId={tripId} />,
    );
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    await screen.findByText("Tokyo");
    await user.click(screen.getAllByRole("button", { name: "Delete" })[0]!);
    expect(remove).not.toHaveBeenCalled();
    expect(screen.getByText("Days assigned to it will become unassigned.")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Confirm delete" }));

    expect(remove).toHaveBeenCalledWith(tripId, destinations[0]!.id);
    expect(invalidate).toHaveBeenCalledWith({
      exact: true,
      queryKey: tripKeys.days(tripId),
    });
  });

  it("moves a destination using the complete ID order", async () => {
    vi.spyOn(tripsApi, "listDestinations").mockResolvedValue(destinations);
    const reorder = vi.spyOn(tripsApi, "reorderDestinations").mockResolvedValue([
      { ...destinations[1]!, position: 0 },
      { ...destinations[0]!, position: 1 },
    ]);
    const user = userEvent.setup();
    renderWithQueryClient(<DestinationsSection canEdit tripId={tripId} />);

    await screen.findByText("Tokyo");
    await user.click(screen.getAllByRole("button", { name: "Move down" })[0]!);
    expect(reorder).toHaveBeenCalledWith(tripId, {
      destinationIds: [destinations[1]!.id, destinations[0]!.id],
    });
  });

  it("previews and explicitly saves a destination location", async () => {
    vi.spyOn(tripsApi, "listDestinations").mockResolvedValue(destinations);
    const update = vi.spyOn(tripsApi, "updateDestination").mockResolvedValue({
      ...destinations[0]!,
      latitude: 35.6762,
      longitude: 139.6503,
    });
    const user = userEvent.setup();
    renderWithQueryClient(<DestinationsSection canEdit tripId={tripId} />);

    await user.click((await screen.findAllByRole("button", { name: "Set location" }))[0]!);
    expect(screen.getByRole("button", { name: "Save location" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Pick Tokyo point" }));
    await user.click(screen.getByRole("button", { name: "Save location" }));

    expect(update).toHaveBeenCalledWith(tripId, destinations[0]!.id, {
      latitude: 35.6762,
      longitude: 139.6503,
    });
    await waitFor(() => expect(screen.getAllByText("Location set")).toHaveLength(1));
  });

  it("cancels a location preview without persisting", async () => {
    const located = [
      { ...destinations[0]!, latitude: 35.6762, longitude: 139.6503 },
    ];
    vi.spyOn(tripsApi, "listDestinations").mockResolvedValue(located);
    const update = vi.spyOn(tripsApi, "updateDestination");
    const user = userEvent.setup();
    renderWithQueryClient(<DestinationsSection canEdit tripId={tripId} />);

    await user.click(await screen.findByRole("button", { name: "Change location" }));
    await user.click(screen.getByRole("button", { name: "Pick Tokyo point" }));
    await user.click(screen.getByRole("button", { name: "Cancel location" }));

    expect(update).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Save location" })).not.toBeInTheDocument();
    expect(screen.getByText("Location set")).toBeVisible();
  });

  it("keeps the preview available for retry after a location mutation error", async () => {
    vi.spyOn(tripsApi, "listDestinations").mockResolvedValue(destinations);
    vi.spyOn(tripsApi, "updateDestination").mockRejectedValue(new Error("offline"));
    const user = userEvent.setup();
    renderWithQueryClient(<DestinationsSection canEdit tripId={tripId} />);

    await user.click((await screen.findAllByRole("button", { name: "Set location" }))[0]!);
    await user.click(screen.getByRole("button", { name: "Pick Tokyo point" }));
    await user.click(screen.getByRole("button", { name: "Save location" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Unable to update destinations. Please try again.",
    );
    expect(screen.getByRole("button", { name: "Save location" })).toBeEnabled();
  });

  it("clears a location only after explicit confirmation", async () => {
    const located = [
      { ...destinations[0]!, latitude: 35.6762, longitude: 139.6503 },
    ];
    vi.spyOn(tripsApi, "listDestinations").mockResolvedValue(located);
    const update = vi.spyOn(tripsApi, "updateDestination").mockResolvedValue({
      ...located[0]!,
      latitude: null,
      longitude: null,
    });
    const user = userEvent.setup();
    renderWithQueryClient(<DestinationsSection canEdit tripId={tripId} />);

    await user.click(await screen.findByRole("button", { name: "Clear location" }));
    expect(update).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Confirm clear location" }));

    expect(update).toHaveBeenCalledWith(tripId, destinations[0]!.id, {
      latitude: null,
      longitude: null,
    });
  });

  it("keeps map editing controls out of the viewer experience", async () => {
    vi.spyOn(tripsApi, "listDestinations").mockResolvedValue([
      { ...destinations[0]!, latitude: 35.6762, longitude: 139.6503 },
    ]);
    renderWithQueryClient(<DestinationsSection canEdit={false} tripId={tripId} />);

    expect(await screen.findByRole("button", { name: "Show on map" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Change location" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Clear location" })).not.toBeInTheDocument();
  });
});
