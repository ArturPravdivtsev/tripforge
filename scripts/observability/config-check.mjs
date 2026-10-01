import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const collectorArchitecture = process.arch === "arm64" ? "arm64" : "amd64";
const collectorImage = `otel/opentelemetry-collector-contrib:0.162.0-${collectorArchitecture}`;

run("docker", [
  "run",
  "--rm",
  "-v",
  `${root}/observability/otel-collector.yaml:/etc/otelcol-contrib/config.yaml:ro`,
  collectorImage,
  "validate",
  "--config=/etc/otelcol-contrib/config.yaml",
]);
run("docker", [
  "run",
  "--rm",
  "-v",
  `${root}/observability/prometheus:/etc/prometheus:ro`,
  "--entrypoint",
  "/bin/promtool",
  "prom/prometheus:v3.15.0",
  "check",
  "config",
  "/etc/prometheus/prometheus.yml",
]);
run("docker", [
  "run",
  "--rm",
  "-v",
  `${root}/observability/prometheus:/etc/prometheus:ro`,
  "--entrypoint",
  "/bin/promtool",
  "prom/prometheus:v3.15.0",
  "test",
  "rules",
  "/etc/prometheus/rules.test.yml",
]);

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
