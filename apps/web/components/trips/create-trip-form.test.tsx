import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiClientError } from "@/lib/api/errors";
import { tripsApi } from "@/lib/api/trips";
import { tripKeys } from "@/lib/trips/query-keys";
import { renderWithQueryClient } from "@/test-utils";

import { CreateTripForm } from "./create-trip-form";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

const createdTrip = {
  createdAt: "2027-01-01T00:00:00.000Z",
  endsOn: null,
  id: "11111111-1111-4111-8111-111111111111",
  name: "Japan 2027",
  startsOn: null,
  updatedAt: "2027-01-01T00:00:00.000Z",
};

describe("CreateTripForm", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    push.mockReset();
  });

  it("has accessible labels and validates name and date range", async () => {
    const user = userEvent.setup();
    renderWithQueryClient(<CreateTripForm />);

    expect(screen.getByRole("textbox", { name: "Name" })).toBeVisible();
    expect(screen.getByLabelText("Start date")).toHaveAttribute("type", "date");
    expect(screen.getByLabelText("End date")).toHaveAttribute("type", "date");
    await user.click(screen.getByRole("button", { name: "Create trip" }));
    expect(await screen.findByText("Enter a trip name.")).toBeVisible();

    await user.type(screen.getByRole("textbox", { name: "Name" }), "Japan");
    fireEvent.change(screen.getByLabelText("Start date"), {
      target: { value: "2027-04-12" },
    });
    fireEvent.change(screen.getByLabelText("End date"), {
      target: { value: "2027-04-11" },
    });
    await user.click(screen.getByRole("button", { name: "Create trip" }));
    expect(
      await screen.findByText("End date cannot be before start date."),
    ).toBeVisible();
  });

  it("submits trimmed values, converts empty dates to null, and navigates", async () => {
    const create = vi.spyOn(tripsApi, "create").mockResolvedValue(createdTrip);
    const user = userEvent.setup();
    const { queryClient } = renderWithQueryClient(<CreateTripForm />);
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    await user.type(screen.getByRole("textbox", { name: "Name" }), "  Japan 2027  ");
    await user.click(screen.getByRole("button", { name: "Create trip" }));

    await waitFor(() =>
      expect(create).toHaveBeenCalledWith({
        endsOn: null,
        name: "Japan 2027",
        startsOn: null,
      }),
    );
    expect(invalidate).toHaveBeenCalledWith({ queryKey: tripKeys.lists() });
    expect(push).toHaveBeenCalledWith("/trips");
  });

  it("prevents duplicate pending submissions and presents safe errors", async () => {
    let rejectCreate: ((reason: unknown) => void) | undefined;
    const create = vi.spyOn(tripsApi, "create").mockImplementation(
      () => new Promise((_resolve, reject) => (rejectCreate = reject)),
    );
    const user = userEvent.setup();
    renderWithQueryClient(<CreateTripForm />);

    await user.type(screen.getByRole("textbox", { name: "Name" }), "Japan");
    await user.click(screen.getByRole("button", { name: "Create trip" }));
    expect(await screen.findByRole("button", { name: "Creating…" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Creating…" }));
    expect(create).toHaveBeenCalledOnce();

    rejectCreate?.(
      new ApiClientError("internal backend text", 400, "INVALID_TRIP_DATE_RANGE"),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Check the trip name and dates, then try again.",
    );
  });
});
