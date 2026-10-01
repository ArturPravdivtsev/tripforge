import Joi from "joi";

import { LOG_LEVELS } from "../observability/observability-config";

const defaultDatabaseUrl =
  "postgresql://tripforge:tripforge@127.0.0.1:5433/tripforge";

export const workerEnvironmentSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid("development", "test", "production")
    .default("development"),
  DATABASE_URL: Joi.string()
    .uri({ scheme: ["postgresql", "postgres"] })
    .when("NODE_ENV", {
      is: "production",
      then: Joi.required(),
      otherwise: Joi.string().default(defaultDatabaseUrl),
    }),
  REDIS_URL: Joi.string()
    .uri({ scheme: ["redis", "rediss"] })
    .when("NODE_ENV", {
      is: "production",
      then: Joi.required(),
      otherwise: Joi.string().default("redis://127.0.0.1:6379"),
    }),
  LOG_LEVEL: Joi.string()
    .valid(...LOG_LEVELS)
    .when("NODE_ENV", {
      is: "development",
      then: Joi.string().default("debug"),
      otherwise: Joi.string().default("info"),
    }),
  OTEL_ENABLED: Joi.boolean().truthy("true").falsy("false").default(false),
  OTEL_EXPORTER_OTLP_ENDPOINT: Joi.string()
    .uri({ scheme: ["http", "https"] })
    .default("http://127.0.0.1:4318"),
  OTEL_EXPORT_TIMEOUT_MS: Joi.number()
    .integer()
    .min(500)
    .max(10_000)
    .default(3_000),
  OTEL_METRIC_EXPORT_INTERVAL_MS: Joi.number()
    .integer()
    .min(1_000)
    .max(300_000)
    .default(15_000),
  OTEL_SERVICE_INSTANCE_ID: Joi.string().trim().min(1).max(128).optional(),
  OTEL_TRACES_SAMPLER: Joi.string()
    .valid("parentbased_traceidratio")
    .default("parentbased_traceidratio"),
  OTEL_TRACES_SAMPLER_ARG: Joi.number().min(0).max(1).when("NODE_ENV", {
    is: "production",
    then: Joi.number().default(0.1),
    otherwise: Joi.number().default(1),
  }),
  TRIPFORGE_VERSION: Joi.string().trim().min(1).max(128).optional(),
  S3_BUCKET: Joi.string().trim().min(3).default("tripforge-documents"),
  S3_REGION: Joi.string().trim().min(1).default("us-east-1"),
  S3_ENDPOINT: Joi.string()
    .uri({ scheme: ["http", "https"] })
    .trim()
    .empty("")
    .optional(),
  S3_PUBLIC_ENDPOINT: Joi.string()
    .uri({ scheme: ["http", "https"] })
    .trim()
    .empty("")
    .optional(),
  S3_FORCE_PATH_STYLE: Joi.boolean()
    .truthy("true")
    .falsy("false")
    .default(false),
});

export function validateWorkerEnvironment(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const { error, value } = workerEnvironmentSchema.validate(config, {
    abortEarly: false,
    allowUnknown: true,
  });
  if (error) {
    const details = error.details.map(({ message }) => message).join("; ");
    throw new Error(`Invalid worker environment configuration: ${details}`);
  }
  return value as Record<string, unknown>;
}
