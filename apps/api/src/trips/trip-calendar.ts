const DAY_IN_MILLISECONDS = 86_400_000;

function toUtcMilliseconds(value: string): number {
  const [year, month, day] = value.split("-").map(Number);

  return Date.UTC(year!, month! - 1, day!);
}

export function generateTripDates(
  startsOn: string | null,
  endsOn: string | null,
): string[] {
  if (!startsOn || !endsOn) {
    return [];
  }

  const dates: string[] = [];
  const end = toUtcMilliseconds(endsOn);

  for (
    let current = toUtcMilliseconds(startsOn);
    current <= end;
    current += DAY_IN_MILLISECONDS
  ) {
    dates.push(new Date(current).toISOString().slice(0, 10));
  }

  return dates;
}

export function planDayReconciliation(
  existingDates: readonly string[],
  desiredDates: readonly string[],
): Readonly<{ insert: string[]; remove: string[] }> {
  const existing = new Set(existingDates);
  const desired = new Set(desiredDates);

  return {
    insert: desiredDates.filter((date) => !existing.has(date)),
    remove: existingDates.filter((date) => !desired.has(date)),
  };
}
