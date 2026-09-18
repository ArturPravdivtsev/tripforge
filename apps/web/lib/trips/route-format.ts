export function formatRouteDistance(meters: number): string {
  if (meters < 1_000) return `${Math.round(meters)} m`;

  const kilometers = meters / 1_000;
  return `${kilometers < 10 ? kilometers.toFixed(1) : Math.round(kilometers)} km`;
}

export function formatRouteDuration(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes} min`;

  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder === 0 ? `${hours} h` : `${hours} h ${remainder} min`;
}
