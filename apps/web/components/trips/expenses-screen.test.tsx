import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {
  ExpenseParticipant,
  Trip,
  TripExpense,
  TripExpenseBalances,
  TripReservation,
} from "@tripforge/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { tripsApi } from "@/lib/api/trips";
import { tripKeys } from "@/lib/trips/query-keys";
import { renderWithQueryClient } from "@/test-utils";

import { ExpensesScreen } from "./expenses-screen";

const owner = participant("11111111-1111-4111-8111-111111111111", "Artur");
const anna = participant("22222222-2222-4222-8222-222222222222", "Anna");
const trip: Trip = {
  accessRole: "owner",
  createdAt: "2027-01-01T00:00:00.000Z",
  endsOn: "2027-04-20",
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  name: "Japan",
  startsOn: "2027-04-10",
  updatedAt: "2027-01-01T00:00:00.000Z",
};
const reservation: TripReservation = {
  confirmationCode: null,
  createdAt: "2027-01-01T00:00:00.000Z",
  endDate: null,
  endTime: null,
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  itineraryItemId: null,
  kind: "restaurant",
  locationName: null,
  notes: null,
  providerName: null,
  startDate: "2027-04-14",
  startTime: null,
  status: "confirmed",
  title: "Sushi Dai",
  transport: null,
  updatedAt: "2027-01-01T00:00:00.000Z",
};
const expense: TripExpense = {
  amountMinor: 10_000,
  category: "food",
  createdAt: "2027-01-01T00:00:00.000Z",
  currency: "EUR",
  id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  notes: "Team dinner",
  paidBy: owner,
  reservationId: reservation.id,
  shares: [
    { amountMinor: 5000, participant: owner },
    { amountMinor: 5000, participant: anna },
  ],
  spentOn: "2027-04-14",
  splitMethod: "equal",
  title: "Dinner",
  updatedAt: "2027-01-01T00:00:00.000Z",
};
const balances: TripExpenseBalances = {
  currencies: [
    {
      balances: [
        { netMinor: 5000, participant: owner },
        { netMinor: -5000, participant: anna },
      ],
      currency: "EUR",
      settlements: [{ amountMinor: 5000, from: anna, to: owner }],
      totalExpensesMinor: 10_000,
    },
    {
      balances: [],
      currency: "JPY",
      settlements: [],
      totalExpensesMinor: 1200,
    },
  ],
};

describe("ExpensesScreen", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(tripsApi, "get").mockResolvedValue(trip);
    vi.spyOn(tripsApi, "listExpenses").mockResolvedValue([expense]);
    vi.spyOn(tripsApi, "getExpenseBalances").mockResolvedValue(balances);
    vi.spyOn(tripsApi, "listReservations").mockResolvedValue([reservation]);
  });

  it("renders separate currencies, exact balances, settlement and reservation", async () => {
    renderWithQueryClient(<ExpensesScreen tripId={trip.id} />);
    expect(await screen.findByText("Dinner")).toBeVisible();
    expect(screen.getByText("EUR")).toBeVisible();
    expect(screen.getByText("JPY")).toBeVisible();
    expect(screen.getByText(/Anna → Artur/)).toBeVisible();
    expect(screen.getByRole("link", { name: "Sushi Dai" })).toBeVisible();
    expect(screen.queryByText(/grand total/i)).not.toBeInTheDocument();
  });

  it("renders an intentional viewer mode", async () => {
    vi.spyOn(tripsApi, "get").mockResolvedValue({ ...trip, accessRole: "viewer" });
    renderWithQueryClient(<ExpensesScreen tripId={trip.id} />);
    expect(await screen.findByText("Dinner")).toBeVisible();
    expect(screen.queryByRole("link", { name: "Add expense" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete expense" })).not.toBeInTheDocument();
  });

  it("invalidates list and balances after confirmed deletion", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const remove = vi.spyOn(tripsApi, "removeExpense").mockResolvedValue();
    const { queryClient } = renderWithQueryClient(<ExpensesScreen tripId={trip.id} />);
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    await user.click(await screen.findByRole("button", { name: "Delete expense" }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith(trip.id, expense.id));
    expect(invalidate).toHaveBeenCalledWith({
      exact: true,
      queryKey: tripKeys.expenses(trip.id),
    });
    expect(invalidate).toHaveBeenCalledWith({
      exact: true,
      queryKey: tripKeys.expenseBalances(trip.id),
    });
  });

  it("shows loading and empty states", async () => {
    vi.spyOn(tripsApi, "listExpenses").mockResolvedValue([]);
    vi.spyOn(tripsApi, "getExpenseBalances").mockResolvedValue({ currencies: [] });
    renderWithQueryClient(<ExpensesScreen tripId={trip.id} />);
    expect(await screen.findByText("No expenses yet.")).toBeVisible();
    expect(screen.getByText("No balances yet.")).toBeVisible();
  });
});

function participant(userId: string, displayName: string): ExpenseParticipant {
  return { displayName, email: `${displayName.toLowerCase()}@example.com`, userId };
}
