import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Trip, TripParticipant } from "@tripforge/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiClientError } from "@/lib/api/errors";
import { tripsApi } from "@/lib/api/trips";
import { tripKeys } from "@/lib/trips/query-keys";
import { renderWithQueryClient } from "@/test-utils";

import { MembersScreen } from "./members-screen";

const trip: Trip = {
  accessRole: "owner",
  createdAt: "2027-01-01T00:00:00.000Z",
  endsOn: null,
  id: "11111111-1111-4111-8111-111111111111",
  name: "Japan 2027",
  startsOn: null,
  updatedAt: "2027-01-01T00:00:00.000Z",
};

const participants: TripParticipant[] = [
  {
    role: "owner",
    user: {
      displayName: "Trip Owner",
      email: "owner@example.com",
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    },
  },
  {
    role: "editor",
    user: {
      displayName: "A Friend With A Long Display Name",
      email: "friend-with-a-long-address@example.com",
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    },
  },
];

describe("MembersScreen", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  function mockSuccess(accessRole: Trip["accessRole"] = "owner") {
    vi.spyOn(tripsApi, "get").mockResolvedValue({ ...trip, accessRole });
    return vi.spyOn(tripsApi, "listMembers").mockResolvedValue(participants);
  }

  it("loads participants and gives only the owner management controls", async () => {
    mockSuccess();
    renderWithQueryClient(<MembersScreen tripId={trip.id} />);

    expect(
      screen.getByRole("status", { name: "Loading trip members" }),
    ).toBeVisible();
    expect(await screen.findByRole("heading", { name: "Japan 2027" })).toBeVisible();
    expect(screen.getByText("Trip Owner")).toBeVisible();
    expect(screen.getByText("owner@example.com")).toBeVisible();
    expect(screen.getByText("owner")).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Account email" })).toBeVisible();
    expect(screen.getByLabelText("Role for A Friend With A Long Display Name")).toBeVisible();
    expect(screen.getByRole("button", { name: "Remove" })).toBeVisible();
  });

  it.each(["editor", "viewer"] as const)(
    "renders a read-only list for %s access",
    async (accessRole) => {
      mockSuccess(accessRole);
      renderWithQueryClient(<MembersScreen tripId={trip.id} />);

      expect(await screen.findByText("Trip Owner")).toBeVisible();
      expect(screen.queryByRole("textbox", { name: "Account email" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Remove" })).not.toBeInTheDocument();
      expect(
        screen.queryByLabelText("Role for A Friend With A Long Display Name"),
      ).not.toBeInTheDocument();
    },
  );

  it("validates, adds by canonical email, and refreshes members", async () => {
    const listMembers = mockSuccess();
    const add = vi.spyOn(tripsApi, "addMember").mockResolvedValue({
      role: "viewer",
      user: {
        displayName: null,
        email: "new@example.com",
        id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      },
    });
    const user = userEvent.setup();
    const { queryClient } = renderWithQueryClient(
      <MembersScreen tripId={trip.id} />,
    );
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    const email = await screen.findByRole("textbox", { name: "Account email" });
    await user.type(email, "not-an-email");
    await user.click(screen.getByRole("button", { name: "Add member" }));
    expect(await screen.findByText("Enter a valid email address.")).toBeVisible();

    await user.clear(email);
    await user.type(email, "  NEW@EXAMPLE.COM  ");
    await user.click(screen.getByRole("button", { name: "Add member" }));

    await waitFor(() =>
      expect(add).toHaveBeenCalledWith(trip.id, {
        email: "new@example.com",
        role: "viewer",
      }),
    );
    expect(invalidate).toHaveBeenCalledWith({
      exact: true,
      queryKey: tripKeys.members(trip.id),
    });
    await waitFor(() => expect(listMembers).toHaveBeenCalledTimes(2));
  });

  it("shows stable add-member errors without backend detail", async () => {
    mockSuccess();
    vi.spyOn(tripsApi, "addMember").mockRejectedValue(
      new ApiClientError("database details", 404, "INVITEE_NOT_FOUND"),
    );
    const user = userEvent.setup();
    renderWithQueryClient(<MembersScreen tripId={trip.id} />);

    await user.type(
      await screen.findByRole("textbox", { name: "Account email" }),
      "missing@example.com",
    );
    await user.click(screen.getByRole("button", { name: "Add member" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No TripForge account was found for that email.",
    );
    expect(screen.queryByText("database details")).not.toBeInTheDocument();
  });

  it("changes a role and confirms removal before mutating", async () => {
    mockSuccess();
    const update = vi.spyOn(tripsApi, "updateMemberRole").mockResolvedValue({
      ...participants[1]!,
      role: "viewer",
    });
    const remove = vi.spyOn(tripsApi, "removeMember").mockResolvedValue();
    const user = userEvent.setup();
    renderWithQueryClient(<MembersScreen tripId={trip.id} />);

    const role = await screen.findByLabelText(
      "Role for A Friend With A Long Display Name",
    );
    await user.selectOptions(role, "viewer");
    expect(update).toHaveBeenCalledWith(trip.id, participants[1]!.user.id, {
      role: "viewer",
    });

    await user.click(screen.getByRole("button", { name: "Remove" }));
    expect(remove).not.toHaveBeenCalled();
    expect(screen.getByText("Remove?")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Confirm remove" }));
    expect(remove).toHaveBeenCalledWith(trip.id, participants[1]!.user.id);
  });

  it.each([
    [401, "Sign in to view trip members."],
    [403, "You do not have permission to view these members."],
    [404, "Trip not found"],
  ] as const)("renders the controlled %s state", async (status, message) => {
    vi.spyOn(tripsApi, "get").mockRejectedValue(
      new ApiClientError("backend detail", status, "CONTROLLED_ERROR"),
    );
    vi.spyOn(tripsApi, "listMembers").mockRejectedValue(
      new ApiClientError("backend detail", status, "CONTROLLED_ERROR"),
    );
    renderWithQueryClient(<MembersScreen tripId={trip.id} />);

    expect(await screen.findByText(message)).toBeVisible();
  });

  it("offers a retry after a network failure", async () => {
    vi.spyOn(tripsApi, "get").mockRejectedValue(new TypeError("offline"));
    vi.spyOn(tripsApi, "listMembers").mockRejectedValue(new TypeError("offline"));
    renderWithQueryClient(<MembersScreen tripId={trip.id} />);

    expect(await screen.findByText("Unable to load trip members.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Try again" })).toBeVisible();
  });
});
