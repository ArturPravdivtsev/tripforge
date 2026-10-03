import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const EXCEPTIONS_PATH = resolve("security/audit-exceptions.json");
const BLOCKING_SEVERITIES = new Set(["high", "critical"]);

function asSortedStrings(values) {
  return [...new Set(values.map(String))].sort();
}

function assertEqualSet(actual, expected, label) {
  const normalizedActual = asSortedStrings(actual);
  const normalizedExpected = asSortedStrings(expected);
  if (JSON.stringify(normalizedActual) !== JSON.stringify(normalizedExpected)) {
    throw new Error(
      `${label} changed: expected ${normalizedExpected.join(", ")}, received ${normalizedActual.join(", ")}`,
    );
  }
}

function validateDate(value, label) {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    throw new Error(`${label} must use YYYY-MM-DD`);
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error(`${label} is not a valid date`);
  }
}

function validateException(exception, today) {
  if (!/^GHSA-[a-z0-9-]+$/u.test(exception.advisory ?? "")) {
    throw new Error("Exception advisory must be an exact GHSA identifier");
  }
  if (!Number.isInteger(exception.auditId)) {
    throw new Error(`${exception.advisory}: auditId must be an integer`);
  }
  if (typeof exception.package !== "string" || exception.package.length === 0) {
    throw new Error(`${exception.advisory}: package is required`);
  }
  if (!BLOCKING_SEVERITIES.has(exception.severity)) {
    throw new Error(`${exception.advisory}: severity must be high or critical`);
  }
  if (!Array.isArray(exception.installedVersions) || exception.installedVersions.length === 0) {
    throw new Error(`${exception.advisory}: installedVersions are required`);
  }
  if (!Array.isArray(exception.dependencyPaths) || exception.dependencyPaths.length === 0) {
    throw new Error(`${exception.advisory}: dependencyPaths are required`);
  }
  if (typeof exception.scope !== "string" || exception.scope.length < 10) {
    throw new Error(`${exception.advisory}: a narrow scope is required`);
  }
  if (typeof exception.reason !== "string" || exception.reason.length < 40) {
    throw new Error(`${exception.advisory}: a substantive reason is required`);
  }
  if (exception.productionReachability !== false) {
    throw new Error(`${exception.advisory}: productionReachability must be false`);
  }
  if (
    typeof exception.remediationTrigger !== "string" ||
    exception.remediationTrigger.length < 40
  ) {
    throw new Error(`${exception.advisory}: a remediation trigger is required`);
  }
  validateDate(exception.reviewAfter ?? "", `${exception.advisory}: reviewAfter`);
  if (today > exception.reviewAfter) {
    throw new Error(
      `${exception.advisory}: exception expired after ${exception.reviewAfter}`,
    );
  }
}

function blockingAdvisories(report) {
  return Object.values(report.advisories ?? {}).filter((advisory) =>
    BLOCKING_SEVERITIES.has(String(advisory.severity).toLowerCase()),
  );
}

export function evaluateAudit(report, policy, today = new Date().toISOString().slice(0, 10)) {
  if (policy?.schemaVersion !== 1 || !Array.isArray(policy.exceptions)) {
    throw new Error("Unsupported audit exception schema");
  }
  validateDate(today, "Policy evaluation date");

  const exceptionsByAdvisory = new Map();
  for (const exception of policy.exceptions) {
    validateException(exception, today);
    if (exceptionsByAdvisory.has(exception.advisory)) {
      throw new Error(`Duplicate exception: ${exception.advisory}`);
    }
    exceptionsByAdvisory.set(exception.advisory, exception);
  }

  const accepted = [];
  const matchedExceptions = new Set();
  for (const advisory of blockingAdvisories(report)) {
    const advisoryId = advisory.github_advisory_id;
    const exception = exceptionsByAdvisory.get(advisoryId);
    if (!exception) {
      throw new Error(
        `Unexpected ${advisory.severity} advisory ${advisoryId ?? advisory.id} in ${advisory.module_name}`,
      );
    }
    if (
      advisory.id !== exception.auditId ||
      advisory.module_name !== exception.package ||
      String(advisory.severity).toLowerCase() !== exception.severity
    ) {
      throw new Error(`${exception.advisory}: advisory identity changed`);
    }

    const findings = advisory.findings ?? [];
    assertEqualSet(
      findings.map((finding) => finding.version),
      exception.installedVersions,
      `${exception.advisory}: installed versions`,
    );
    assertEqualSet(
      findings.flatMap((finding) => finding.paths ?? []),
      exception.dependencyPaths,
      `${exception.advisory}: dependency paths`,
    );
    accepted.push({ advisory, exception });
    matchedExceptions.add(exception.advisory);
  }

  for (const exception of policy.exceptions) {
    if (!matchedExceptions.has(exception.advisory)) {
      throw new Error(
        `${exception.advisory}: exception is obsolete because the advisory is absent`,
      );
    }
  }

  return accepted;
}

async function main() {
  const audit = spawnSync(
    "pnpm",
    ["audit", "--prod", "--audit-level", "high", "--json"],
    { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 },
  );
  if (audit.error) throw audit.error;
  if (audit.status !== 0 && audit.status !== 1) {
    throw new Error(
      `pnpm audit failed with status ${audit.status}: ${audit.stderr.trim()}`,
    );
  }

  let report;
  try {
    report = JSON.parse(audit.stdout);
  } catch {
    throw new Error(`pnpm audit did not return valid JSON: ${audit.stderr.trim()}`);
  }
  if (report.error) {
    throw new Error(`pnpm audit error: ${JSON.stringify(report.error)}`);
  }

  const policy = JSON.parse(await readFile(EXCEPTIONS_PATH, "utf8"));
  const accepted = evaluateAudit(report, policy);
  for (const { advisory, exception } of accepted) {
    process.stdout.write(
      [
        `Accepted ${advisory.severity.toUpperCase()} ${exception.advisory} (${exception.package}@${exception.installedVersions.join(", ")}).`,
        `Scope: ${exception.scope}.`,
        `Reason: ${exception.reason}`,
        `Review after: ${exception.reviewAfter}.`,
      ].join("\n") + "\n",
    );
  }
  process.stdout.write(
    `Security audit policy passed: ${accepted.length} exact, unexpired exception(s); no unexpected HIGH/CRITICAL advisories.\n`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    await main();
  } catch (error) {
    process.stderr.write(`Security audit policy failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}
