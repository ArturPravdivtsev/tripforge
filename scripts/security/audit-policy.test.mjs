import assert from "node:assert/strict";
import { test } from "node:test";

import { evaluateAudit } from "./audit-policy.mjs";

const path =
  "packages__eslint-config>eslint-config-next>@next/eslint-plugin-next>fast-glob>micromatch>braces";

function report(overrides = {}) {
  return {
    advisories: {
      "1240992": {
        id: 1240992,
        github_advisory_id: "GHSA-vfj7-8cjw-p6xm",
        module_name: "braces",
        severity: "high",
        findings: [{ version: "3.0.3", paths: [path] }],
        ...overrides,
      },
    },
  };
}

function policy(overrides = {}) {
  return {
    schemaVersion: 1,
    exceptions: [
      {
        advisory: "GHSA-vfj7-8cjw-p6xm",
        auditId: 1240992,
        cve: "CVE-2026-93687",
        package: "braces",
        severity: "high",
        installedVersions: ["3.0.3"],
        dependencyPaths: [path],
        scope: "development-only lint tooling",
        reason:
          "Only lint tooling installs this package; deployable runtime artifacts do not contain it.",
        productionReachability: false,
        reviewAfter: "2026-11-01",
        remediationTrigger:
          "Remove the exception when a compatible upstream fix becomes available.",
        ...overrides,
      },
    ],
  };
}

test("accepts only an exact exception through its review date", () => {
  assert.equal(evaluateAudit(report(), policy(), "2026-11-01").length, 1);
});

test("rejects an expired exception", () => {
  assert.throws(
    () => evaluateAudit(report(), policy(), "2026-11-02"),
    /expired/u,
  );
});

test("rejects an obsolete exception when the advisory disappears", () => {
  assert.throws(
    () => evaluateAudit({ advisories: {} }, policy(), "2026-10-03"),
    /obsolete/u,
  );
});

test("rejects an unrelated future HIGH advisory", () => {
  const auditReport = report();
  auditReport.advisories.other = {
    id: 999,
    github_advisory_id: "GHSA-aaaa-bbbb-cccc",
    module_name: "other-package",
    severity: "high",
    findings: [{ version: "1.0.0", paths: ["other-package"] }],
  };
  assert.throws(
    () => evaluateAudit(auditReport, policy(), "2026-10-03"),
    /Unexpected high advisory/u,
  );
});

test("rejects changed package, version, and dependency path", () => {
  assert.throws(
    () =>
      evaluateAudit(report({ module_name: "not-braces" }), policy(), "2026-10-03"),
    /identity changed/u,
  );
  assert.throws(
    () =>
      evaluateAudit(
        report({ findings: [{ version: "3.0.4", paths: [path] }] }),
        policy(),
        "2026-10-03",
      ),
    /installed versions changed/u,
  );
  assert.throws(
    () =>
      evaluateAudit(
        report({ findings: [{ version: "3.0.3", paths: ["new>path>braces"] }] }),
        policy(),
        "2026-10-03",
      ),
    /dependency paths changed/u,
  );
});

test("rejects incomplete risk acceptance", () => {
  assert.throws(
    () => evaluateAudit(report(), policy({ reason: "too short" }), "2026-10-03"),
    /substantive reason/u,
  );
  assert.throws(
    () =>
      evaluateAudit(
        report(),
        policy({ productionReachability: true }),
        "2026-10-03",
      ),
    /productionReachability/u,
  );
  assert.throws(
    () => evaluateAudit(report(), policy({ reviewAfter: "someday" }), "2026-10-03"),
    /YYYY-MM-DD/u,
  );
});
