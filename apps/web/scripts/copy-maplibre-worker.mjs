import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const manifest = createRequire(import.meta.url).resolve("maplibre-gl/package.json");
const { version } = JSON.parse(readFileSync(manifest, "utf8"));
const destination = fileURLToPath(new URL(`../public/maplibre/${version}/`, import.meta.url));

// Next emits new URL(worker, import.meta.url) verbatim, without its shared import.
// Copy both installed modules together; versioned paths prevent mixed-version caches.
mkdirSync(destination, { recursive: true });
for (const file of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
  copyFileSync(path.join(path.dirname(manifest), "dist", file), path.join(destination, file));
}
