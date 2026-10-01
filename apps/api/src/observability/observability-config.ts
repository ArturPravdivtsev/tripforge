import { hostname } from "node:os";

export const LOG_LEVELS = [
  "fatal",
  "error",
  "warn",
  "info",
  "debug",
  "trace",
] as const;

export type LogLevel = (typeof LOG_LEVELS)[number];
export type TripForgeServiceName = "tripforge-api" | "tripforge-worker";

export type ObservabilityConfig = Readonly<{
  enabled: boolean;
  environment: string;
  exportIntervalMs: number;
  exportTimeoutMs: number;
  instanceId: string;
  logLevel: LogLevel;
  otlpEndpoint: string;
  samplingRatio: number;
  serviceName: TripForgeServiceName;
  serviceVersion: string;
}>;

const DEFAULT_OTLP_ENDPOINT = "http://127.0.0.1:4318";
const DEFAULT_EXPORT_INTERVAL_MS = 15_000;
const DEFAULT_EXPORT_TIMEOUT_MS = 3_000;

export function readObservabilityConfig(
  serviceName: TripForgeServiceName,
  environment: NodeJS.ProcessEnv = process.env,
): ObservabilityConfig {
  const nodeEnvironment = environment.NODE_ENV ?? "development";

  return {
    enabled: environment.OTEL_ENABLED === "true",
    environment: nodeEnvironment,
    exportIntervalMs: boundedInteger(
      environment.OTEL_METRIC_EXPORT_INTERVAL_MS,
      DEFAULT_EXPORT_INTERVAL_MS,
      1_000,
      300_000,
    ),
    exportTimeoutMs: boundedInteger(
      environment.OTEL_EXPORT_TIMEOUT_MS,
      DEFAULT_EXPORT_TIMEOUT_MS,
      500,
      10_000,
    ),
    instanceId:
      environment.OTEL_SERVICE_INSTANCE_ID?.trim() ||
      `${hostname()}:${process.pid}`,
    logLevel: parseLogLevel(environment.LOG_LEVEL, nodeEnvironment),
    otlpEndpoint: parseEndpoint(environment.OTEL_EXPORTER_OTLP_ENDPOINT),
    samplingRatio: boundedRatio(
      environment.OTEL_TRACES_SAMPLER_ARG,
      nodeEnvironment === "production" ? 0.1 : 1,
    ),
    serviceName,
    serviceVersion:
      environment.TRIPFORGE_VERSION?.trim() ||
      environment.npm_package_version?.trim() ||
      "0.0.0",
  };
}

function parseLogLevel(
  value: string | undefined,
  environment: string,
): LogLevel {
  if (value && LOG_LEVELS.includes(value as LogLevel)) {
    return value as LogLevel;
  }
  return environment === "development" ? "debug" : "info";
}

function parseEndpoint(value: string | undefined): string {
  const candidate = value?.trim() || DEFAULT_OTLP_ENDPOINT;
  try {
    const endpoint = new URL(candidate);
    if (endpoint.protocol === "http:" || endpoint.protocol === "https:") {
      return endpoint.toString().replace(/\/$/u, "");
    }
  } catch {
    // Environment validation reports the invalid value after bootstrap.
  }
  return DEFAULT_OTLP_ENDPOINT;
}

function boundedInteger(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum
    ? parsed
    : fallback;
}

function boundedRatio(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1
    ? parsed
    : fallback;
}
