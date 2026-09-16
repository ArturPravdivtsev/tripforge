export function parseTripsPage(
  value: string | readonly string[] | undefined,
): number {
  const candidate = Array.isArray(value) ? value[0] : value;

  if (!candidate || !/^\d+$/.test(candidate)) {
    return 1;
  }

  const page = Number(candidate);

  return Number.isSafeInteger(page) && page >= 1 ? page : 1;
}
