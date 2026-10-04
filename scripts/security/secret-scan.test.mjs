import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { scanHistory, scanText } from "./secret-scan.mjs";

test("detects high-risk committed secret shapes without returning values", () => {
  const source = [
    `AWS_ACCESS_KEY_ID=${"AKIA" + "ABCDEFGHIJKLMNOP"}`,
    `OPENROUTESERVICE_API_KEY=${"live_" + "a".repeat(30)}`,
    `OPENAI_API_KEY=${"sk-proj-" + "b".repeat(32)}`,
    `cookie=${"tripforge_session=" + "z".repeat(43)}`,
    `-----BEGIN ${"PRIVATE KEY"}-----`,
  ].join("\n");
  const findings = scanText("fixture.txt", source);

  assert.deepEqual(
    findings.map(({ name }) => name),
    [
      "AWS access key",
      "provider secret",
      "OpenAI API key",
      "raw session token",
      "private key",
    ],
  );
  assert.equal(JSON.stringify(findings).includes("live_"), false);
});

test("allows explicit empty and fake fixture values", () => {
  const findings = scanText(
    ".env.example",
    [
      "OPENROUTESERVICE_API_KEY=",
      "OPENAI_API_KEY=",
      "LOCALSTACK_AUTH_TOKEN=placeholder",
      "AWS_SECRET_ACCESS_KEY=test",
      "tripforge_session=opaque-token",
    ].join("\n"),
  );

  assert.deepEqual(findings, []);
});

test("scans reachable Git history without returning credential values", async () => {
  const root = await mkdtemp(join(tmpdir(), "tripforge-history-secret-test-"));
  try {
    execFileSync("git", ["init", "-q"], { cwd: root });
    execFileSync("git", ["config", "user.email", "test@example.invalid"], { cwd: root });
    execFileSync("git", ["config", "user.name", "TripForge Test"], { cwd: root });
    const secret = "sk-proj-" + "h".repeat(40);
    await writeFile(join(root, "old.env"), `OPENAI_API_KEY=${secret}\n`);
    execFileSync("git", ["add", "old.env"], { cwd: root });
    execFileSync("git", ["commit", "-qm", "fixture"], { cwd: root });
    execFileSync("git", ["rm", "-q", "old.env"], { cwd: root });
    execFileSync("git", ["commit", "-qm", "remove fixture"], { cwd: root });

    const result = scanHistory(root);
    assert.equal(result.findings.length, 1);
    assert.equal(result.findings[0].name, "OpenAI API key");
    assert.match(result.findings[0].object, /^[0-9a-f]{40}$/u);
    assert.equal(JSON.stringify(result).includes(secret), false);
  } finally {
    await rm(root, { recursive: true });
  }
});
