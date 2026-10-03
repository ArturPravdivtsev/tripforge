import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { checkMarkdown } from "./check.mjs";

test("docs check resolves local and reference links without crawling external URLs", async () => {
  const root = await mkdtemp(join(tmpdir(), "tripforge-docs-test-"));
  try {
    await mkdir(join(root, "docs")); await writeFile(join(root, "docs", "a.md"), "# A\n");
    assert.deepEqual(await checkMarkdown("[A](docs/a.md#section) [web](https://example.test/unreachable)\n[x]: docs/a.md\n```text\n[example](not-a-real-link)\n```\n", "README.md", root), []);
    for (const [source, expected] of [["[Missing](absent.md)", /missing relative target/u], ["[Escape](../outside.md)", /escapes repository/u], ["[Bad](%ZZ)", /invalid link encoding/u]]) assert.match((await checkMarkdown(source, "README.md", root)).join(), expected);
  } finally { await rm(root, { recursive: true }); }
});

test("docs check catches local paths, unclosed fences, empty alt and oversized assets", async () => {
  const root = await mkdtemp(join(tmpdir(), "tripforge-docs-test-"));
  try {
    await mkdir(join(root, "docs/assets/portfolio"), { recursive: true });
    await writeFile(join(root, "docs/assets/portfolio/large.png"), Buffer.alloc(1_000_001));
    const errors = await checkMarkdown("![](docs/assets/portfolio/large.png)\n```text\n/Users/example/project\n", "README.md", root);
    for (const expected of [/meaningful alt/u, /exceeds 1 MB/u, /absolute local/u, /unclosed code/u]) assert.ok(errors.some((value) => expected.test(value)));
    const referenceErrors = await checkMarkdown("![][large]\n[large]: docs/assets/portfolio/large.png\n[missing][undefined]", "README.md", root);
    for (const expected of [/meaningful alt/u, /exceeds 1 MB/u, /missing reference/u]) assert.ok(referenceErrors.some((value) => expected.test(value)));
  } finally { await rm(root, { recursive: true }); }
});

test("portfolio capture rejects absent, remote and wrong-port targets before starting a stack", () => {
  for (const target of [undefined, "https://example.test", "http://127.0.0.1:3000"]) {
    const env = { ...process.env };
    if (target === undefined) delete env.PORTFOLIO_BASE_URL;
    else env.PORTFOLIO_BASE_URL = target;
    const result = spawnSync(process.execPath, [new URL("../portfolio/screenshots.mjs", import.meta.url).pathname], { env, encoding: "utf8", timeout: 5_000 });
    assert.equal(result.status, 1); assert.equal(result.stdout, "");
    assert.match(result.stderr, /owned disposable fixture/u);
  }
});
