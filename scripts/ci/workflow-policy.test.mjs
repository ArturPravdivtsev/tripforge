import assert from "node:assert/strict";
import test from "node:test";

import { validateWorkflow } from "./workflow-policy.mjs";

const SHA = "0123456789abcdef0123456789abcdef01234567";

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
