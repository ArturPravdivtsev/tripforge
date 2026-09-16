"use client";

import Link from "next/link";
import { useState } from "react";
import type { Trip } from "@tripforge/contracts";
import { Button, Card, CardContent, CardHeader, CardTitle } from "@tripforge/ui";

import { formatTripDates } from "@/lib/trips/calendar-date";

type TripCardProps = Readonly<{
  isDeleting: boolean;
  onDelete: (tripId: string) => void;
  trip: Trip;
}>;

export function TripCard({ isDeleting, onDelete, trip }: TripCardProps) {
  const [isConfirming, setIsConfirming] = useState(false);

  return (
    <Card className="flex min-w-0 flex-col">
      <CardHeader className="min-w-0 flex-1">
        <CardTitle className="break-words">{trip.name}</CardTitle>
        <p className="text-sm text-[var(--muted-foreground)]">
          {formatTripDates(trip.startsOn, trip.endsOn)}
        </p>
      </CardHeader>
      <CardContent>
        {isConfirming ? (
          <div className="space-y-3">
            <p className="break-words text-sm font-medium">
              Delete “{trip.name}”?
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="secondary"
                disabled={isDeleting}
                onClick={() => setIsConfirming(false)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                className="bg-[var(--danger)] text-[var(--danger-foreground)]"
                disabled={isDeleting}
                onClick={() => onDelete(trip.id)}
              >
                {isDeleting ? "Deleting…" : "Delete"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Link
              className="inline-flex min-h-9 items-center justify-center rounded-[var(--radius-md)] bg-[var(--surface-muted)] px-3 py-1.5 text-sm font-semibold transition hover:bg-[var(--muted)]"
              href={`/trips/${trip.id}/edit`}
            >
              Edit
            </Link>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setIsConfirming(true)}
            >
              Delete
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
