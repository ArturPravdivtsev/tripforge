import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createReleaseManifest, writeReleaseAssets } from "./generate-manifest.mjs";
import { assertVersionTag, validateReleaseManifest } from "./policy.mjs";

const SHA = "a".repeat(40);
const DIGEST = "b".repeat(64);

function manifest() {
  return createReleaseManifest({
    version: "1.0.0",
    tag: "v1.0.0",
    commit: SHA,
    web: `ghcr.io/example/tripforge-web@sha256:${DIGEST}`,
    api: `ghcr.io/example/tripforge-api@sha256:${DIGEST}`,
    migrate: `ghcr.io/example/tripforge-migrate@sha256:${DIGEST}`,
  });
}

test("requires exact SemVer tag/version agreement", () => {
  assert.doesNotThrow(() => assertVersionTag("1.0.0", "v1.0.0"));
  assert.throws(() => assertVersionTag("1.0.0", "v1.0.1"), /does not match/u);
  assert.throws(() => assertVersionTag("1.0", "v1.0"), /Invalid SemVer/u);
});

test("accepts the exact release manifest schema", () => {
  assert.equal(validateReleaseManifest(manifest()).version, "1.0.0");
});

test("rejects mutable image tags, truncated commits and unexpected fields", () => {
  assert.throws(() => validateReleaseManifest({ ...manifest(), commit: "abc" }), /full lowercase SHA/u);
  assert.throws(
    () => validateReleaseManifest({ ...manifest(), images: { ...manifest().images, web: { reference: "ghcr.io/example/tripforge-web:1.0.0" } } }),
    /Invalid web image reference/u,
  );
  assert.throws(() => validateReleaseManifest({ ...manifest(), extra: true }), /fields must be exactly/u);
});

test("writes a manifest and checksum only for explicit release assets", async () => {
  const directory = await mkdtemp(join(tmpdir(), "tripforge-release-assets-"));
  try {
    const assets = await writeReleaseAssets(manifest(), directory);
    const checksums = await readFile(assets.checksumsPath, "utf8");
    assert.match(checksums, /^[0-9a-f]{64}  tripforge-v1\.0\.0-release-manifest\.json\n$/u);
    assert.equal(JSON.parse(await readFile(assets.manifestPath, "utf8")).tag, "v1.0.0");
  } finally {
    await rm(directory, { recursive: true });
  }
});
