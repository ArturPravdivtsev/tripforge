import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { validateWorkflow } from "./workflow-policy.mjs";

const SHA = "0123456789abcdef0123456789abcdef01234567";

test("documentation validation cannot disappear or become advisory", async () => {
  const source = await readFile(new URL("../../.github/workflows/ci.yml", import.meta.url), "utf8");
  assert.deepEqual(validateWorkflow(source, "ci.yml"), []);
  for (const replacement of ["run: echo skipped", "continue-on-error: true\n        run: pnpm docs:check", "if: false\n        run: pnpm docs:check"]) {
    assert.ok(validateWorkflow(source.replace("run: pnpm docs:check", replacement), "ci.yml").some((error) => error.includes("blocking pnpm docs:check")));
  }
});

test("formal release is trusted-tag-only and requires Gate, images and manifest", async () => {
  const source = await readFile(new URL("../../.github/workflows/ci.yml", import.meta.url), "utf8");
  assert.deepEqual(validateWorkflow(source, "ci.yml"), []);

  const releaseStart = source.indexOf("\n  release:\n");
  assert.notEqual(releaseStart, -1);
  const prefix = source.slice(0, releaseStart);
  const release = source.slice(releaseStart);

  const mainRelease = release.replace(
    "startsWith(github.ref, 'refs/tags/v')",
    "github.ref == 'refs/heads/main'",
  );
  assert.ok(
    validateWorkflow(prefix + mainRelease, "ci.yml").some((error) =>
      error.includes("trusted version tag push"),
    ),
  );

  for (const dependency of ["gate", "publish", "release-assets"]) {
    const changed = release.replace(`      - ${dependency}\n`, "");
    assert.ok(
      validateWorkflow(prefix + changed, "ci.yml").some((error) =>
        error.includes("release must depend on Gate, image publish and manifest generation"),
      ),
    );
  }
});

test("GHCR web identity keeps API config but excludes deployment-time S3 origin", async () => {
  const source = await readFile(new URL("../../.github/workflows/ci.yml", import.meta.url), "utf8");
  assert.deepEqual(validateWorkflow(source, "ci.yml"), []);

  const withoutApiBuildArg = source.replace(
    "            NEXT_PUBLIC_API_URL=${{ env.PUBLIC_API_URL }}\n",
    "",
  );
  assert.ok(
    validateWorkflow(withoutApiBuildArg, "ci.yml").some((error) =>
      error.includes("publish API build contract"),
    ),
  );

  const withS3BuildArg = source.replace(
    "            NEXT_PUBLIC_MAPTILER_KEY=${{ env.PUBLIC_MAPTILER_KEY }}\n",
    "            NEXT_PUBLIC_MAPTILER_KEY=${{ env.PUBLIC_MAPTILER_KEY }}\n            NEXT_PUBLIC_S3_UPLOAD_ORIGIN=${{ vars.TRIPFORGE_PUBLIC_S3_UPLOAD_ORIGIN }}\n",
  );
  assert.ok(
    validateWorkflow(withS3BuildArg, "ci.yml").some((error) =>
      error.includes("S3 upload origin must not be a publish build input"),
    ),
  );
});

test("accepts an immutable read-only workflow", () => {
  const source = `
name: Example
on: pull_request
permissions:
  contents: read
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@${SHA}
`;

  assert.deepEqual(validateWorkflow(source, "example.yml"), []);
});

test("rejects mutable action references and privileged triggers", () => {
  const source = `
name: Unsafe
on:
  pull_request_target:
permissions:
  contents: write
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
`;
  const errors = validateWorkflow(source, "unsafe.yml");

  assert.ok(errors.some((error) => error.includes("pull_request_target")));
  assert.ok(errors.some((error) => error.includes("not pinned")));
  assert.ok(errors.some((error) => error.includes("workflow-level write")));
});

test("rejects an unguarded publish job", () => {
  const source = `
name: CI
on: [pull_request, push]
permissions:
  contents: read
jobs:
  quality: &job
    runs-on: ubuntu-latest
    steps: []
  database: *job
  integration: *job
  security: *job
  docker: *job
  gate:
    name: Gate
    if: always()
    needs: [quality, database, integration, security, docker]
    runs-on: ubuntu-latest
    steps: []
  publish:
    needs: gate
    permissions:
      packages: write
    runs-on: ubuntu-latest
    steps: []
`;
  const errors = validateWorkflow(source, "ci.yml");

  assert.ok(errors.some((error) => error.includes("unexpected write")));
  assert.ok(errors.some((error) => error.includes("guarded")));
});

test("rejects privilege bridges and forced cache writes", () => {
  const source = `
name: Bridge
on:
  workflow_run:
    workflows: [CI]
    types: [completed]
permissions:
  contents: read
jobs:
  bridge:
    runs-on: ubuntu-latest
    steps:
      - run: "echo 'cache-mode: write'"
`;
  const errors = validateWorkflow(source, "bridge.yml");

  assert.ok(errors.some((error) => error.includes("workflow_run")));
  assert.ok(errors.some((error) => error.includes("cache-mode: write")));
});

test("rejects an incomplete aggregate gate and non-blocking Docker policy", () => {
  const source = `
name: CI
on: [pull_request, push]
permissions:
  contents: read
jobs:
  quality: &job
    runs-on: ubuntu-latest
    steps: []
  database: *job
  integration: *job
  security: *job
  docker:
    runs-on: ubuntu-latest
    steps:
      - run: trivy image --exit-code 0 candidate
  gate:
    name: Gate
    if: always()
    needs: [quality, database, integration, security]
    runs-on: ubuntu-latest
    steps: []
  publish:
    if: github.event_name == 'push' && (github.ref == 'refs/heads/main' || startsWith(github.ref, 'refs/tags/v'))
    needs: gate
    runs-on: ubuntu-latest
    steps: []
`;
  const errors = validateWorkflow(source, "ci.yml");

  assert.ok(errors.some((error) => error.includes("every mandatory job")));
  assert.ok(errors.some((error) => error.includes("--exit-code 1")));
  assert.ok(errors.some((error) => error.includes("type=semver")));
});

test("allows AWS OIDC only in the trusted production deployment", () => {
  const source = `
name: Deploy AWS
on:
  workflow_dispatch:
permissions:
  contents: read
jobs:
  deploy:
    environment: production
    permissions:
      contents: read
      id-token: write
    runs-on: ubuntu-latest
    steps:
      - uses: aws-actions/configure-aws-credentials@${SHA}
      - name: Run migration before service rollout
        run: '[[ "$DIGEST" =~ sha256:[0-9a-f]{64} ]] && echo assignPublicIp=DISABLED'
      - name: Roll out API, worker, and web
        run: aws ecs wait services-stable
`;

  assert.deepEqual(validateWorkflow(source, "deploy-aws.yml"), []);
});

test("rejects AWS credentials outside the trusted deployment", () => {
  const source = `
name: Unsafe AWS
on: pull_request
permissions:
  contents: read
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: aws-actions/configure-aws-credentials@${SHA}
`;

  assert.ok(
    validateWorkflow(source, "ci-extra.yml").some((error) =>
      error.includes("restricted to deploy-aws.yml"),
    ),
  );
});
