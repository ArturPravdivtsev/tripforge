import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

test("workspace runtime tasks build internal dependencies before execution", async () => {
  const [packageJson, turboJson] = await Promise.all([
    readFile(resolve(root, "package.json"), "utf8").then(JSON.parse),
    readFile(resolve(root, "turbo.json"), "utf8").then(JSON.parse),
  ]);

  const runtimeTasks = [
    ["ai:eval", "ai:eval", "turbo run ai:eval --filter=@tripforge/api"],
    ["ai:test", "ai:test", "turbo run ai:test --filter=@tripforge/api"],
    ["build", "build", "turbo run build"],
    ["test", "test", "turbo run test"],
    ["test:a11y", "test:a11y", "turbo run test:a11y --filter=@tripforge/web"],
    ["test:coverage", "test:coverage", "turbo run test:coverage"],
    [
      "test:integration",
      "test:integration",
      "turbo run test:integration --filter=@tripforge/api",
    ],
    [
      "observability:test",
      "test:observability",
      "turbo run test:observability --filter=@tripforge/api --filter=@tripforge/web",
    ],
  ];

  for (const [script, task, command] of runtimeTasks) {
    assert.equal(packageJson.scripts[script], command);
    assert.ok(turboJson.tasks[task].dependsOn.includes("^build"));
  }

  assert.match(
    packageJson.scripts["test:security"],
    /^turbo run test:security --filter=@tripforge\/api --filter=@tripforge\/web(?: |$)/,
  );
  assert.ok(turboJson.tasks["test:security"].dependsOn.includes("^build"));

  for (const task of ["test:integration", "test:security"]) {
    assert.equal(turboJson.tasks[task].cache, false);
  }
});
