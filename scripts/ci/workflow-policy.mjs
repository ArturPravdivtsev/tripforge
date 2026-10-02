import { readFile, readdir } from "node:fs/promises";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

import { parse } from "yaml";

const SHA_ACTION = /^[^./][^@]*@[0-9a-f]{40}$/u;
const FORBIDDEN_TRIGGERS = ["pull_request_target", "workflow_run"];
const FORBIDDEN_TEXT = [
  "cache-mode: write",
  "GH_ADMIN_TOKEN",
];
const WRITE_PERMISSIONS = new Set([
  "actions",
  "attestations",
  "checks",
  "contents",
  "deployments",
  "discussions",
  "id-token",
  "issues",
  "packages",
  "pages",
  "pull-requests",
  "repository-projects",
  "security-events",
  "statuses",
]);

function entries(value) {
  return value && typeof value === "object" ? Object.entries(value) : [];
}

function collectUses(value, result = []) {
  if (Array.isArray(value)) {
    for (const item of value) collectUses(item, result);
    return result;
  }

  if (!value || typeof value !== "object") return result;

  for (const [key, child] of Object.entries(value)) {
    if (key === "uses" && typeof child === "string") result.push(child);
    collectUses(child, result);
  }

  return result;
}

function writeScopes(permissions) {
  if (!permissions || typeof permissions !== "object") return [];

  return entries(permissions)
    .filter(([scope, access]) => WRITE_PERMISSIONS.has(scope) && access === "write")
    .map(([scope]) => scope);
}

export function validateWorkflow(source, filename = "workflow.yml") {
  const errors = [];
  let workflow;

  try {
    workflow = parse(source);
  } catch (error) {
    return [`${filename}: invalid YAML: ${error.message}`];
  }

  if (!workflow || typeof workflow !== "object") {
    return [`${filename}: workflow must be a YAML mapping`];
  }

  const triggers = workflow.on ?? {};
  for (const trigger of FORBIDDEN_TRIGGERS) {
    if (typeof triggers === "object" && trigger in triggers) {
      errors.push(`${filename}: forbidden trigger ${trigger}`);
    }
  }

  for (const action of collectUses(workflow)) {
    if (!action.startsWith("./") && !SHA_ACTION.test(action)) {
      errors.push(`${filename}: action is not pinned to a full SHA: ${action}`);
    }
    if (
      action.startsWith("aws-actions/configure-aws-credentials@") &&
      basename(filename) !== "deploy-aws.yml"
    ) {
      errors.push(
        `${filename}: AWS credentials action is restricted to deploy-aws.yml`,
      );
    }
  }

  for (const forbidden of FORBIDDEN_TEXT) {
    if (source.includes(forbidden)) {
      errors.push(`${filename}: forbidden workflow content: ${forbidden}`);
    }
  }

  const rootWriteScopes = writeScopes(workflow.permissions);
  if (rootWriteScopes.length > 0) {
    errors.push(
      `${filename}: workflow-level write permissions: ${rootWriteScopes.join(", ")}`,
    );
  }

  for (const [jobName, job] of entries(workflow.jobs)) {
    const scopes = writeScopes(job.permissions);
    if (scopes.length === 0) continue;

    const condition = String(job.if ?? "");
    const isTrustedPublish =
      basename(filename) === "ci.yml" &&
      jobName === "publish" &&
      condition.includes("github.event_name == 'push'") &&
      condition.includes("refs/heads/main") &&
      condition.includes("refs/tags/v");
    const isCodeql =
      basename(filename) === "codeql.yml" &&
      scopes.every((scope) => scope === "security-events");
    const isAwsDeploy =
      basename(filename) === "deploy-aws.yml" &&
      jobName === "deploy" &&
      job.environment === "production" &&
      scopes.every((scope) => scope === "id-token");

    if (!isTrustedPublish && !isCodeql && !isAwsDeploy) {
      errors.push(
        `${filename}: job ${jobName} has unexpected write permissions: ${scopes.join(", ")}`,
      );
    }
  }

  if (basename(filename) === "ci.yml") {
    const jobs = workflow.jobs ?? {};
    const gate = jobs.gate;
    const publish = jobs.publish;
    const mandatory = [
      "quality",
      "database",
      "integration",
      "security",
      "docker",
      "infrastructure",
      "browser",
    ];
    const gateNeeds = Array.isArray(gate?.needs) ? gate.needs : [];

    if (gate?.name !== "Gate" || !String(gate?.if ?? "").includes("always()")) {
      errors.push(`${filename}: gate must expose stable CI / Gate and use always()`);
    }
    if (mandatory.some((job) => !gateNeeds.includes(job))) {
      errors.push(`${filename}: gate must depend on every mandatory job`);
    }
    if (publish?.needs !== "gate") {
      errors.push(`${filename}: publish must depend only on the successful gate`);
    }
    const browserText = JSON.stringify(jobs.browser ?? {});
    for (const required of ["pnpm test:e2e", "playwright install --with-deps chromium", "pnpm perf:load smoke", "install-k6.mjs"]) {
      if (!browserText.includes(required)) errors.push(`${filename}: mandatory browser/load policy is missing ${required}`);
    }
    if (!String(publish?.if ?? "").includes("github.event_name == 'push'")) {
      errors.push(`${filename}: publish must be guarded against pull_request events`);
    }

    for (const [jobName, job] of entries(jobs)) {
      const actions = collectUses(job);
      if (
        jobName !== "publish" &&
        actions.some((action) => action.startsWith("docker/login-action@"))
      ) {
        errors.push(`${filename}: registry login is restricted to publish`);
      }
    }

    const dockerCommands = JSON.stringify(jobs.docker?.steps ?? []);
    for (const required of [
      "trivy image",
      "--severity HIGH,CRITICAL",
      "--ignore-unfixed",
      "--exit-code 1",
      "tripforge-ci-web:local",
      "tripforge-ci-api:local",
      "tripforge-ci-migrate:local",
    ]) {
      if (!dockerCommands.includes(required)) {
        errors.push(`${filename}: Docker scan policy is missing ${required}`);
      }
    }

    const publishText = JSON.stringify(publish ?? {});
    for (const required of [
      "type=sha,format=long",
      "type=raw,value=main,enable=${{ github.ref == 'refs/heads/main' }}",
      "type=semver,pattern={{version}}",
      "type=raw,value=latest,enable=${{ startsWith(github.ref, 'refs/tags/v') }}",
      '"provenance":"mode=max"',
      '"sbom":true',
    ]) {
      if (!publishText.includes(required)) {
        errors.push(`${filename}: publish policy is missing ${required}`);
      }
    }
  }

  if (basename(filename) === "deploy-aws.yml") {
    const jobs = workflow.jobs ?? {};
    const deploy = jobs.deploy;
    const deployText = JSON.stringify(deploy ?? {});
    const triggers = workflow.on ?? {};

    if (
      typeof triggers !== "object" ||
      !("workflow_dispatch" in triggers) ||
      Object.keys(triggers).some((trigger) => trigger !== "workflow_dispatch")
    ) {
      errors.push(`${filename}: deployment must be workflow_dispatch-only`);
    }
    if (deploy?.environment !== "production") {
      errors.push(`${filename}: deploy job must use the production environment`);
    }
    if (deploy?.permissions?.["id-token"] !== "write") {
      errors.push(`${filename}: deploy job must request OIDC id-token write`);
    }
    if (
      !collectUses(deploy).some((action) =>
        action.startsWith("aws-actions/configure-aws-credentials@"),
      )
    ) {
      errors.push(`${filename}: deploy job must configure AWS through OIDC`);
    }
    for (const forbidden of ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"]){
      if (source.includes(forbidden)) {
        errors.push(`${filename}: static AWS credential reference: ${forbidden}`);
      }
    }
    for (const required of [
      "sha256:[0-9a-f]{64}",
      "Run migration before service rollout",
      "Roll out API, worker, and web",
      "services-stable",
      "assignPublicIp=DISABLED",
    ]) {
      if (!deployText.includes(required)) {
        errors.push(`${filename}: deployment policy is missing ${required}`);
      }
    }
  }

  return errors;
}

export async function validateWorkflowDirectory(directory) {
  const files = (await readdir(directory))
    .filter((file) => /\.ya?ml$/u.test(file))
    .sort();
  const errors = [];

  for (const file of files) {
    const path = join(directory, file);
    errors.push(...validateWorkflow(await readFile(path, "utf8"), path));
  }

  return { errors, files };
}

async function main() {
  const root = fileURLToPath(new URL("../..", import.meta.url));
  const directory = join(root, ".github", "workflows");
  const { errors, files } = await validateWorkflowDirectory(directory);

  if (errors.length > 0) {
    console.error(errors.join("\n"));
    process.exitCode = 1;
    return;
  }

  console.log(`Workflow policy passed for ${files.length} file(s).`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
