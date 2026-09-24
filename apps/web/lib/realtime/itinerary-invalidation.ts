type PendingInvalidation = () => void | Promise<void>;

const activeTrips = new Set<string>();
const pending = new Map<string, Set<PendingInvalidation>>();

export function beginItineraryReorder(tripId: string): void {
  activeTrips.add(tripId);
}

export function deferDuringItineraryReorder(
  tripId: string,
  invalidation: PendingInvalidation,
): void {
  if (!activeTrips.has(tripId)) {
    void invalidation();
    return;
  }

  const callbacks = pending.get(tripId) ?? new Set<PendingInvalidation>();
  callbacks.add(invalidation);
  pending.set(tripId, callbacks);
}

export function endItineraryReorder(tripId: string): void {
  activeTrips.delete(tripId);
  const callbacks = pending.get(tripId);
  pending.delete(tripId);
  for (const callback of callbacks ?? []) {
    void callback();
  }
}
