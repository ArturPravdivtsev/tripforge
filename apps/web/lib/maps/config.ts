const MAPTILER_STYLE_ID = "streets-v2";

export const DEFAULT_MAP_VIEW = {
  latitude: 20,
  longitude: 0,
  zoom: 1.5,
} as const;

export function getMapTilerKey(): string | undefined {
  return process.env.NEXT_PUBLIC_MAPTILER_KEY?.trim() || undefined;
}

export function getMapTilerStyleUrl(): string | undefined {
  const key = getMapTilerKey();

  if (!key) return undefined;

  return `https://api.maptiler.com/maps/${MAPTILER_STYLE_ID}/style.json?key=${encodeURIComponent(key)}`;
}
