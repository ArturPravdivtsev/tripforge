"use client";

import { useSyncExternalStore } from "react";

const query = "(prefers-reduced-motion: reduce)";

export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

function getSnapshot(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia(query).matches;
}

function subscribe(onChange: () => void): () => void {
  if (typeof window.matchMedia !== "function") return () => undefined;
  const media = window.matchMedia(query);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}
