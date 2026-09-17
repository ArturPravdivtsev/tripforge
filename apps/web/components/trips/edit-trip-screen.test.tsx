import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiClientError } from "@/lib/api/errors";
import { tripsApi } from "@/lib/api/trips";
import { tripKeys } from "@/lib/trips/query-keys";
import { renderWithQueryClient } from "@/test-utils";

import { EditTripScreen } from "./edit-trip-screen";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

const trip = {
  accessRole: "owner" as const,
  createdAt: "2027-01-01T00:00:00.000Z",
  endsOn: "2027-04-28",
  id: "11111111-1111-4111-8111-111111111111",
  name: "Japan 2027",
  startsOn: "2027-04-12",
  updatedAt: "2027-01-01T00:00:00.000Z",
};

describe("EditTripScreen", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    push.mockReset();
  });

  it("loads and hydrates the form once", async () => {
    let resolveTrip: ((value: typeof trip) => void) | undefined;
    vi.spyOn(tripsApi, "get").mockImplementation(
      () => new Promise((resolve) => (resolveTrip = resolve)),
    );
    renderWithQueryClient(<EditTripScreen tripId={trip.id} />);

    expect(screen.getByRole("status", { name: "Loading trip" })).toBeVisible();
    resolveTrip?.(trip);
    expect(await screen.findByRole("textbox", { name: "Name" })).toHaveValue(
      "Japan 2027",
    );
    expect(screen.getByLabelText("Start date")).toHaveValue("2027-04-12");
  });

  it.each([
    [401, "UNAUTHENTICATED", "Sign in to edit this trip."],
    [404, "TRIP_NOT_FOUND", "Trip not found"],
  ] as const)("renders controlled %s state", async (status, code, message) => {
    vi.spyOn(tripsApi, "get").mockRejectedValue(
      new ApiClientError("backend detail", status, code),
    );
    renderWithQueryClient(<EditTripScreen tripId={trip.id} />);

    expect(await screen.findByText(message)).toBeVisible();
  });

  it("edits fields, clears a date, updates cache, and navigates", async () => {
    vi.spyOn(tripsApi, "get").mockResolvedValue(trip);
    const update = vi.spyOn(tripsApi, "update").mockResolvedValue({
      ...trip,
      endsOn: null,
      name: "Japan 2028",
    });
    const user = userEvent.setup();
    const { queryClient } = renderWithQueryClient(
      <EditTripScreen tripId={trip.id} />,
    );
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    const name = await screen.findByRole("textbox", { name: "Name" });
    await user.clear(name);
    await user.type(name, "Japan 2028");
    fireEvent.change(screen.getByLabelText("End date"), {
      target: { value: "" },
    });
    await user.click(screen.getByRole("button", { name: "Save trip" }));

    await waitFor(() =>
      expect(update).toHaveBeenCalledWith(trip.id, {
        endsOn: null,
        name: "Japan 2028",
        startsOn: "2027-04-12",
      }),
    );
    expect(queryClient.getQueryData(tripKeys.detail(trip.id))).toMatchObject({
      endsOn: null,
      name: "Japan 2028",
    });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: tripKeys.days(trip.id),
    });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: tripKeys.itinerary(trip.id),
    });
    expect(push).toHaveBeenCalledWith("/trips");
  });

  it("shows a safe update failure", async () => {
    vi.spyOn(tripsApi, "get").mockResolvedValue(trip);
    vi.spyOn(tripsApi, "update").mockRejectedValue(new TypeError("database detail"));
    const user = userEvent.setup();
    renderWithQueryClient(<EditTripScreen tripId={trip.id} />);

    await screen.findByRole("textbox", { name: "Name" });
    await user.click(screen.getByRole("button", { name: "Save trip" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Unable to update trip. Please try again.",
    );
  });

  it("explains when a date change would remove planned items", async () => {
    vi.spyOn(tripsApi, "get").mockResolvedValue(trip);
    vi.spyOn(tripsApi, "update").mockRejectedValue(
      new ApiClientError(
        "database detail",
        409,
        "TRIP_DATE_CHANGE_WOULD_REMOVE_ITINERARY",
      ),
    );
    const user = userEvent.setup();
    renderWithQueryClient(<EditTripScreen tripId={trip.id} />);

    await screen.findByRole("textbox", { name: "Name" });
    await user.click(screen.getByRole("button", { name: "Save trip" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "These dates would remove days that already contain plans.",
    );
    expect(screen.queryByText("database detail")).not.toBeInTheDocument();
  });

  it("shows a permission state instead of a form to viewers", async () => {
    vi.spyOn(tripsApi, "get").mockResolvedValue({
      ...trip,
      accessRole: "viewer",
    });
    renderWithQueryClient(<EditTripScreen tripId={trip.id} />);

    expect(
      await screen.findByText("You have view-only access to this trip."),
    ).toBeVisible();
    expect(screen.queryByRole("textbox", { name: "Name" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Members" })).toHaveAttribute(
      "href",
      `/trips/${trip.id}/members`,
    );
  });
});
