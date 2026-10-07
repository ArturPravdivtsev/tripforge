// @vitest-environment node

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

describe("MapLibre worker assets", () => {
  it("copies the installed worker and relative shared dependency byte-for-byte", () => {
    const script = fileURLToPath(new URL("../../scripts/copy-maplibre-worker.mjs", import.meta.url));
    const manifest = createRequire(import.meta.url).resolve("maplibre-gl/package.json");
    const { version } = JSON.parse(readFileSync(manifest, "utf8")) as { version: string };
    const copied = spawnSync(process.execPath, [script], { encoding: "utf8" });
    expect(copied.status, copied.stderr).toBe(0);
    const directory = fileURLToPath(new URL(`../../public/maplibre/${version}/`, import.meta.url));
    for (const file of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
      expect(readFileSync(path.join(directory, file)))
        .toEqual(readFileSync(path.join(path.dirname(manifest), "dist", file)));
    }
    expect(readFileSync(path.join(directory, "maplibre-gl-worker.mjs"), "utf8"))
      .toContain('./maplibre-gl-shared.mjs');
  });
});
