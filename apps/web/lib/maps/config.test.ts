import { afterEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_MAP_VIEW, getMapTilerStyleUrl } from "./config";

describe("MapTiler configuration", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("keeps the existing browser key, streets-v2 style and default camera", () => {
    vi.stubEnv("NEXT_PUBLIC_MAPTILER_KEY", " public key+test ");
    expect(getMapTilerStyleUrl()).toBe("https://api.maptiler.com/maps/streets-v2/style.json?key=public%20key%2Btest");
    expect(DEFAULT_MAP_VIEW).toEqual({ latitude: 20, longitude: 0, zoom: 1.5 });
  });

  it("does not initialize a provider style without a key", () => {
    vi.stubEnv("NEXT_PUBLIC_MAPTILER_KEY", " ");
    expect(getMapTilerStyleUrl()).toBeUndefined();
  });
});
