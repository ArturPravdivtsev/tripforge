import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

test("integration tests build workspace dependencies before execution", async () => {
  const [packageJson, turboJson] = await Promise.all([
    readFile(resolve(root, "package.json"), "utf8").then(JSON.parse),
    readFile(resolve(root, "turbo.json"), "utf8").then(JSON.parse),
  ]);

  assert.equal(
    packageJson.scripts["test:integration"],
    "turbo run test:integration --filter=@tripforge/api",
  );
  assert.deepEqual(turboJson.tasks["test:integration"], {
    dependsOn: ["^build"],
    cache: false,
  });
});
