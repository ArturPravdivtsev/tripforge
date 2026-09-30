import assert from "node:assert/strict";
import { test } from "node:test";

import { evaluateBundleBudget } from "./bundle-budget.mjs";

test("accepts metrics at or below every budget", () => {
  const violations = evaluateBundleBudget(
    { javascript: { rawBytes: 100 }, mapLeakRoutes: [] },
    { limits: { "javascript.rawBytes": 100, "mapLeakRoutes.length": 0 } },
  );

  assert.deepEqual(violations, []);
});

test("reports exceeded and unavailable metrics", () => {
  const violations = evaluateBundleBudget(
    { javascript: { rawBytes: 101 } },
    { limits: { "javascript.rawBytes": 100, "mapLazy.rawBytes": 50 } },
  );

  assert.deepEqual(violations, [
    {
      actual: 101,
      difference: 1,
      limit: 100,
      metric: "javascript.rawBytes",
      reason: "exceeded",
    },
    {
      actual: undefined,
      difference: null,
      limit: 50,
      metric: "mapLazy.rawBytes",
      reason: "missing",
    },
  ]);
});
