import assert from "node:assert/strict";
import { test } from "node:test";

import { scanText } from "./secret-scan.mjs";

test("detects high-risk committed secret shapes without returning values", () => {
  const source = [
    `AWS_ACCESS_KEY_ID=${"AKIA" + "ABCDEFGHIJKLMNOP"}`,
    `OPENROUTESERVICE_API_KEY=${"live_" + "a".repeat(30)}`,
    `cookie=${"tripforge_session=" + "z".repeat(43)}`,
    `-----BEGIN ${"PRIVATE KEY"}-----`,
  ].join("\n");
  const findings = scanText("fixture.txt", source);

  assert.deepEqual(
    findings.map(({ name }) => name),
    ["AWS access key", "provider secret", "raw session token", "private key"],
  );
  assert.equal(JSON.stringify(findings).includes("live_"), false);
});

test("allows explicit empty and fake fixture values", () => {
  const findings = scanText(
    ".env.example",
    [
      "OPENROUTESERVICE_API_KEY=",
      "LOCALSTACK_AUTH_TOKEN=placeholder",
      "AWS_SECRET_ACCESS_KEY=test",
      "tripforge_session=opaque-token",
    ].join("\n"),
  );

  assert.deepEqual(findings, []);
});
