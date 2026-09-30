import { readFile } from "node:fs/promises";
import path from "node:path";

import { evaluateBundleBudget } from "./bundle-budget.mjs";
import { collectBundleMetrics } from "./bundle-metrics.mjs";

const budget = JSON.parse(
  await readFile(new URL("./bundle-budget.json", import.meta.url), "utf8"),
);
const metrics = await collectBundleMetrics(path.resolve("apps/web/.next"));
const violations = evaluateBundleBudget(metrics, budget);

if (violations.length > 0) {
  process.stderr.write("Bundle performance budget failed:\n");
  for (const violation of violations) {
    const difference =
      violation.difference === null ? "metric is unavailable" : `+${violation.difference} B`;
    process.stderr.write(
      `- ${violation.metric}: budget ${violation.limit} B, actual ${String(violation.actual)} B (${difference})\n`,
    );
  }
  process.exitCode = 1;
} else {
  process.stdout.write(
    `Bundle performance budget passed (${Object.keys(budget.limits).length} metrics).\n`,
  );
}
