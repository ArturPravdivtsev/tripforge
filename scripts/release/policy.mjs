const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/u;
const COMMIT = /^[0-9a-f]{40}$/u;
const IMAGE_REFERENCE = /^ghcr\.io\/[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?\/tripforge-(?:web|api|migrate)@sha256:[0-9a-f]{64}$/u;
const MIGRATION_HEAD = /^\d{4}_[a-z0-9_]+\.sql$/u;

const MANIFEST_KEYS = [
  "commit",
  "images",
  "migrationHead",
  "releaseEvidence",
  "schemaVersion",
  "tag",
  "version",
];
const IMAGE_KEYS = ["api", "migrate", "web"];
const EVIDENCE_KEYS = ["browserE2E", "integration", "readiness", "securityAudit"];

function exactKeys(value, expected, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const actual = Object.keys(value).sort();
  if (JSON.stringify(actual) !== JSON.stringify([...expected].sort())) {
    throw new Error(`${label} fields must be exactly: ${expected.join(", ")}`);
  }
}

export function assertVersionTag(version, tag) {
  if (!SEMVER.test(version)) throw new Error(`Invalid SemVer version: ${version}`);
  if (tag !== `v${version}`) {
    throw new Error(`Tag ${tag} does not match canonical version ${version}`);
  }
}

export function validateReleaseManifest(manifest) {
  exactKeys(manifest, MANIFEST_KEYS, "Release manifest");
  if (manifest.schemaVersion !== 1) throw new Error("Unsupported release manifest schema");
  assertVersionTag(manifest.version, manifest.tag);
  if (!COMMIT.test(manifest.commit)) throw new Error("Release commit must be a full lowercase SHA");
  if (!MIGRATION_HEAD.test(manifest.migrationHead)) throw new Error("Invalid migration head");

  exactKeys(manifest.images, IMAGE_KEYS, "Release images");
  for (const image of IMAGE_KEYS) {
    exactKeys(manifest.images[image], ["reference"], `${image} image`);
    const reference = manifest.images[image].reference;
    if (!IMAGE_REFERENCE.test(reference) || !reference.includes(`/tripforge-${image}@`)) {
      throw new Error(`Invalid ${image} image reference`);
    }
  }

  exactKeys(manifest.releaseEvidence, EVIDENCE_KEYS, "Release evidence");
  for (const key of EVIDENCE_KEYS) {
    const value = manifest.releaseEvidence[key];
    if (typeof value !== "string" || value.length < 8 || value.length > 240) {
      throw new Error(`Release evidence ${key} must be a concise non-empty string`);
    }
  }

  return manifest;
}
