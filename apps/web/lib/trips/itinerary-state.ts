import { arrayMove } from "@dnd-kit/helpers";
import type {
  ItineraryItem,
  ReorderItineraryItemsRequest,
  TripDay,
} from "@tripforge/contracts";

export type ItineraryGroups = Record<string, ItineraryItem[]>;

export function groupItineraryItems(
  days: readonly TripDay[],
  items: readonly ItineraryItem[],
): ItineraryGroups {
  const groups = Object.fromEntries(days.map(({ id }) => [id, []])) as ItineraryGroups;

  for (const item of items) {
    groups[item.dayId]?.push(item);
  }

  for (const dayItems of Object.values(groups)) {
    dayItems.sort((left, right) =>
      left.position === right.position
        ? left.id.localeCompare(right.id)
        : left.position - right.position,
    );
  }

  return groups;
}

export function moveItineraryItem(
  groups: ItineraryGroups,
  sourceDayId: string,
  sourceIndex: number,
  targetDayId: string,
  targetIndex: number,
): ItineraryGroups {
  if (sourceDayId === targetDayId) {
    const items = groups[sourceDayId] ?? [];
    return { ...groups, [sourceDayId]: arrayMove(items, sourceIndex, targetIndex) };
  }

  const sourceItems = [...(groups[sourceDayId] ?? [])];
  const targetItems = [...(groups[targetDayId] ?? [])];
  const [moved] = sourceItems.splice(sourceIndex, 1);
  if (!moved) return groups;
  targetItems.splice(targetIndex, 0, moved);

  return {
    ...groups,
    [sourceDayId]: sourceItems,
    [targetDayId]: targetItems,
  };
}

export function flattenItineraryGroups(
  days: readonly TripDay[],
  groups: ItineraryGroups,
): ItineraryItem[] {
  return days.flatMap(({ id: dayId }) =>
    (groups[dayId] ?? []).map((item, position) => ({
      ...item,
      dayId,
      position,
    })),
  );
}

export function buildItineraryReorderRequest(
  before: ItineraryGroups,
  after: ItineraryGroups,
): ReorderItineraryItemsRequest {
  const dayIds = Object.keys(after).filter((dayId) => {
    const previous = (before[dayId] ?? []).map(({ id }) => id);
    const next = (after[dayId] ?? []).map(({ id }) => id);
    return previous.length !== next.length || previous.some((id, index) => id !== next[index]);
  });

  return {
    days: dayIds.map((dayId) => ({
      dayId,
      itemIds: (after[dayId] ?? []).map(({ id }) => id),
    })),
  };
}
