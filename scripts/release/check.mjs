import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

import { validateAuditPolicy } from "../security/audit-policy.mjs";
import { assertVersionTag, validateReleaseManifest } from "./policy.mjs";

const root = resolve(import.meta.dirname, "../..");
const packageJson = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
const version = packageJson.version;
const expectedTag = `v${version}`;

assertVersionTag(version, expectedTag);
if (version !== "1.0.0") throw new Error(`Stage 33 requires canonical version 1.0.0, received ${version}`);

const changelog = await readFile(resolve(root, "CHANGELOG.md"), "utf8");
if (!changelog.includes(`## [${version}]`)) throw new Error(`CHANGELOG is missing ${version}`);

const notesPath = resolve(root, `docs/releases/v${version}.md`);
const notes = await readFile(notesPath, "utf8");
if (!notes.startsWith(`# TripForge v${version}\n`)) throw new Error(`Release notes heading does not match ${version}`);

const policy = JSON.parse(await readFile(resolve(root, "security/audit-exceptions.json"), "utf8"));
validateAuditPolicy(policy);

const migrations = (await readdir(resolve(root, "apps/api/drizzle")))
  .filter((file) => /^\d{4}_.+\.sql$/u.test(file))
  .sort();
if (migrations.at(-1) !== "0014_foamy_jackal.sql") {
  throw new Error(`Unexpected migration head: ${migrations.at(-1)}`);
}

const ref = process.env.GITHUB_REF;
if (ref?.startsWith("refs/tags/")) assertVersionTag(version, ref.slice("refs/tags/".length));

const manifestPath = process.env.TRIPFORGE_RELEASE_MANIFEST;
if (manifestPath) {
  validateReleaseManifest(JSON.parse(await readFile(resolve(manifestPath), "utf8")));
}

process.stdout.write(
  `Release check passed: version ${version}, tag ${expectedTag}, notes, CHANGELOG, migration head, security exception and optional manifest schema.\n`,
);
