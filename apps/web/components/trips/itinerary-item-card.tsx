"use client";

import { useSortable } from "@dnd-kit/react/sortable";
import type { RefCallback } from "react";
import type { ItineraryItem } from "@tripforge/contracts";
import { Button } from "@tripforge/ui";

type ItineraryItemCardProps = Readonly<{
  canEdit: boolean;
  dayId: string;
  index: number;
  item: ItineraryItem;
  moveActionRef?: RefCallback<HTMLButtonElement>;
  moveInstructionsId?: string;
  onDelete: (item: ItineraryItem) => void;
  onEdit: (item: ItineraryItem) => void;
  onMove: (item: ItineraryItem) => void;
  onSelectPlace?: (itemId: string) => void;
  selected?: boolean;
}>;

export function ItineraryItemCard({
  canEdit,
  dayId,
  index,
  item,
  moveActionRef,
  moveInstructionsId,
  onDelete,
  onEdit,
  onMove,
  onSelectPlace,
  selected,
}: ItineraryItemCardProps) {
  const { handleRef, isDragging, ref } = useSortable({
    accept: "itinerary-item",
    data: { itemId: item.id },
    disabled: !canEdit,
    group: dayId,
    id: item.id,
    index,
    type: "itinerary-item",
  });

  return (
    <article
      ref={ref}
      className={`min-w-0 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-3 shadow-sm ${
        isDragging ? "opacity-50" : ""
      } ${selected ? "border-[var(--primary)] ring-2 ring-[var(--focus-ring)]" : ""
      }`}
    >
      <div className="flex min-w-0 items-start gap-2">
        {canEdit ? (
          <Button
            ref={handleRef}
            aria-describedby={moveInstructionsId}
            aria-label={`Reorder “${item.title}” by drag or keyboard`}
            className="shrink-0 px-2"
            size="sm"
            variant="ghost"
          >
            <span aria-hidden="true">⠿</span>
          </Button>
        ) : null}

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="min-w-0 flex-1 break-words font-semibold">{item.title}</h3>
            {item.startTime || item.endTime ? (
              <span className="shrink-0 text-sm font-semibold">
                {item.startTime ? <time dateTime={item.startTime}>{item.startTime}</time> : "—"}
                {" – "}
                {item.endTime ? <time dateTime={item.endTime}>{item.endTime}</time> : "—"}
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
            {kindLabels[item.kind]}
          </p>
          {item.place ? (
            <div className="mt-2 min-w-0 text-sm">
              <p className="break-words font-medium">📍 {item.place.name}</p>
              {item.place.address ? (
                <p className="break-words text-[var(--muted-foreground)]">
                  {item.place.address}
                </p>
              ) : null}
              {onSelectPlace ? (
                <Button
                  className="mt-1 px-0"
                  size="sm"
                  type="button"
                  variant="ghost"
                  onClick={() => onSelectPlace(item.id)}
                >
                  Show on map
                </Button>
              ) : null}
            </div>
          ) : null}
          {item.notes ? <p className="mt-2 whitespace-pre-wrap break-words text-sm">{item.notes}</p> : null}
        </div>

        {canEdit ? (
          <div className="flex shrink-0 gap-1">
            <Button
              ref={moveActionRef}
              aria-label={`Move “${item.title}” without dragging`}
              className="px-2"
              size="sm"
              variant="ghost"
              onClick={() => onMove(item)}
            >
              Move
            </Button>
            <Button
              aria-label={`Edit “${item.title}”`}
              className="px-2"
              size="sm"
              variant="ghost"
              onClick={() => onEdit(item)}
            >
              Edit
            </Button>
            <Button
              aria-label={`Delete “${item.title}”`}
              className="px-2 text-[var(--danger)]"
              size="sm"
              variant="ghost"
              onClick={() => onDelete(item)}
            >
              Delete
            </Button>
          </div>
        ) : null}
      </div>
    </article>
  );
}

const kindLabels = {
  accommodation: "Accommodation",
  activity: "Activity",
  food: "Food",
  other: "Other",
  transport: "Transport",
} as const;
