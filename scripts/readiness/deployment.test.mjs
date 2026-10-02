import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { parse } from "yaml";

const exec = promisify(execFile);
const workflow = parse(await readFile(new URL("../../.github/workflows/deploy-aws.yml", import.meta.url), "utf8"));
const steps = workflow.jobs.deploy.steps;
const migration = steps.find((step) => step.name === "Run migration before service rollout").run;
const rollout = steps.find((step) => step.name === "Roll out API, worker, and web").run;
const fakeAws = `
aws() {
  case "$1 $2" in
    "ecs run-task") echo 'arn:aws:ecs:eu-west-1:123456789012:task/disposable/stage31';;
    "ecs describe-tasks") printf '{"tasks":[{"containers":[{"name":"migrate","exitCode":%s}]}]}' "$FAKE_MIGRATION_EXIT";;
    "ecs update-service") echo 'UPDATE_SERVICE_MARKER' >&2;;
    "ecs wait") return 0;;
    *) echo 'Unexpected fake AWS command' >&2; return 99;;
  esac
}
`;

for (const exitCode of [0, 42]) test(`actual deployment shell gates service rollout on migration exit ${exitCode}`, async () => {
  const directory = await mkdtemp(join(tmpdir(), "tripforge-deploy-test-"));
  try {
    let result;
    try {
      result = await exec("bash", ["-euo", "pipefail", "-c", `${fakeAws}\n${migration}\n${rollout}`], {
        cwd: directory,
        env: { ...process.env, FAKE_MIGRATION_EXIT: String(exitCode), ECS_CLUSTER: "disposable", MIGRATE_TASK_DEFINITION: "disposable:1", ECS_MIGRATE_SUBNETS: "subnet-test", ECS_MIGRATE_SECURITY_GROUP: "sg-test", API_TASK_DEFINITION: "api:1", WORKER_TASK_DEFINITION: "worker:1", WEB_TASK_DEFINITION: "web:1", ECS_API_SERVICE: "api", ECS_WORKER_SERVICE: "worker", ECS_WEB_SERVICE: "web" },
      });
      assert.equal(exitCode, 0);
    } catch (error) {
      assert.equal(exitCode, 42);
      assert.equal(error.code, 1);
      result = error;
    }
    assert.equal((result.stderr.match(/UPDATE_SERVICE_MARKER/g) ?? []).length, exitCode === 0 ? 3 : 0);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
