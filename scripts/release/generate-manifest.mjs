import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { validateReleaseManifest } from "./policy.mjs";

export function createReleaseManifest({
  version,
  tag,
  commit,
  web,
  api,
  migrate,
}) {
  return validateReleaseManifest({
    schemaVersion: 1,
    version,
    tag,
    commit,
    images: {
      web: { reference: web },
      api: { reference: api },
      migrate: { reference: migrate },
    },
    migrationHead: "0014_foamy_jackal.sql",
    releaseEvidence: {
      browserE2E: "CI / Browser and bounded load passed for the trusted tag",
      integration: "CI / Integration passed for the trusted tag",
      readiness: "Stage 31 retained evidence: 13/13 local recovery drills",
      securityAudit: "CI / Security passed with the exact time-bounded policy",
    },
  });
}

export async function writeReleaseAssets(manifest, outputDirectory = ".") {
  const filename = `tripforge-v${manifest.version}-release-manifest.json`;
  const path = resolve(outputDirectory, filename);
  const json = `${JSON.stringify(validateReleaseManifest(manifest), null, 2)}\n`;
  await writeFile(path, json);
  const digest = createHash("sha256").update(json).digest("hex");
  const checksumsPath = resolve(outputDirectory, "SHA256SUMS");
  await writeFile(checksumsPath, `${digest}  ${basename(path)}\n`);
  return { manifestPath: path, checksumsPath, digest };
}

async function main() {
  const [version, tag, commit, web, api, migrate, outputDirectory = "."] = process.argv.slice(2);
  if (![version, tag, commit, web, api, migrate].every(Boolean)) {
    throw new Error("Usage: generate-manifest <version> <tag> <commit> <web> <api> <migrate> [output-directory]");
  }
  const manifest = createReleaseManifest({ version, tag, commit, web, api, migrate });
  const assets = await writeReleaseAssets(manifest, outputDirectory);
  validateReleaseManifest(JSON.parse(await readFile(assets.manifestPath, "utf8")));
  process.stdout.write(`Release assets generated: ${basename(assets.manifestPath)}, SHA256SUMS.\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    await main();
  } catch (error) {
    process.stderr.write(`Release asset generation failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}
