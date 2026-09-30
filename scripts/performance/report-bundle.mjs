import path from "node:path";

import { collectBundleMetrics } from "./bundle-metrics.mjs";

const nextDirectory = path.resolve("apps/web/.next");
const metrics = await collectBundleMetrics(nextDirectory);

process.stdout.write(`${JSON.stringify(metrics, null, 2)}\n`);
