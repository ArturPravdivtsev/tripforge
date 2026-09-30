export function evaluateBundleBudget(metrics, budget) {
  return Object.entries(budget.limits).flatMap(([metric, limit]) => {
    const actual = readMetric(metrics, metric);

    if (typeof actual !== "number") {
      return [{ actual, difference: null, limit, metric, reason: "missing" }];
    }

    return actual > limit
      ? [{ actual, difference: actual - limit, limit, metric, reason: "exceeded" }]
      : [];
  });
}

function readMetric(value, path) {
  return path.split(".").reduce((current, key) => {
    if (key === "length" && Array.isArray(current)) return current.length;
    if (current === null || typeof current !== "object") return undefined;
    return current[key];
  }, value);
}
