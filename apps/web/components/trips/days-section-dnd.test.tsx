import { act, screen, waitFor, within } from "@testing-library/react";
import type { ItineraryItem, TripDay } from "@tripforge/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { tripsApi } from "@/lib/api/trips";
import { renderWithQueryClient } from "@/test-utils";

import { DaysSection } from "./days-section";

type DragHandlers = {
  onDragEnd?: (event: unknown) => void;
  onDragStart?: (event: unknown) => void;
};

const drag = vi.hoisted(() => ({ current: {} as DragHandlers }));

vi.mock("@dnd-kit/react", () => ({
  DragDropProvider: ({
    children,
    onDragEnd,
    onDragStart,
  }: React.PropsWithChildren<DragHandlers>) => {
    drag.current = { onDragEnd, onDragStart };
    return children;
  },
}));

vi.mock("@dnd-kit/react/sortable", () => ({
  isSortableOperation: () => true,
  useSortable: () => ({
    handleRef: vi.fn(),
    isDragging: false,
    isDropTarget: false,
    ref: vi.fn(),
  }),
}));

const tripId = "11111111-1111-4111-8111-111111111111";
const days: TripDay[] = [
  { date: "2027-04-12", destinationId: null, id: "day-1" },
  { date: "2027-04-13", destinationId: null, id: "day-2" },
];

function item(id: string, dayId: string, position: number): ItineraryItem {
  return {
    createdAt: "2027-01-01T00:00:00.000Z",
    dayId,
    id,
    kind: "activity",
    notes: null,
    place: null,
    position,
    startTime: null,
    title: id,
    updatedAt: "2027-01-01T00:00:00.000Z",
  };
}

describe("DaysSection drag-and-drop", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    drag.current = {};
    vi.spyOn(tripsApi, "listDays").mockResolvedValue(days);
    vi.spyOn(tripsApi, "listDestinations").mockResolvedValue([]);
    vi.spyOn(tripsApi, "listItineraryItems").mockResolvedValue([
      item("A", "day-1", 0),
      item("B", "day-1", 1),
      item("C", "day-2", 0),
    ]);
  });

  it("optimistically moves across Days and restores the full snapshot on failure", async () => {
    let rejectReorder: ((reason?: unknown) => void) | undefined;
    const reorder = vi.spyOn(tripsApi, "reorderItineraryItems").mockImplementation(
      () => new Promise((_resolve, reject) => (rejectReorder = reject)),
    );
    renderWithQueryClient(<DaysSection canEdit tripId={tripId} />);

    const dayOne = (await screen.findByText("Day 1")).closest("li")!;
    const dayTwo = screen.getByText("Day 2").closest("li")!;
    expect(within(dayOne).getByText("B")).toBeVisible();
    expect(within(dayTwo).queryByText("B")).not.toBeInTheDocument();

    act(() => {
      drag.current.onDragStart?.({ operation: { source: { id: "B" } } });
      drag.current.onDragEnd?.({
        canceled: false,
        operation: {
          source: {
            id: "B",
            group: "day-2",
            index: 0,
            initialGroup: "day-1",
            initialIndex: 1,
          },
        },
      });
    });

    await waitFor(() => {
      expect(reorder).toHaveBeenCalledWith(tripId, {
        days: [
          { dayId: "day-1", itemIds: ["A"] },
          { dayId: "day-2", itemIds: ["B", "C"] },
        ],
      });
      expect(within(dayTwo).getByText("B")).toBeVisible();
    });

    await act(async () => rejectReorder?.(new TypeError("database detail")));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Unable to save the new itinerary order. Your changes were restored.",
    );
    await waitFor(() => {
      expect(within(dayOne).getByText("B")).toBeVisible();
      expect(within(dayTwo).queryByText("B")).not.toBeInTheDocument();
    });
    expect(screen.queryByText("database detail")).not.toBeInTheDocument();
  });
});
