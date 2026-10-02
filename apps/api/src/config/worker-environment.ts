import Joi from "joi";

import { LOG_LEVELS } from "../observability/observability-config";

const defaultDatabaseUrl =
  "postgresql://tripforge:tripforge@127.0.0.1:5433/tripforge";
const databaseKeys = [
  "DATABASE_HOST",
  "DATABASE_PORT",
  "DATABASE_NAME",
  "DATABASE_USER",
  "DATABASE_PASSWORD",
] as const;

export const workerEnvironmentSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid("development", "test", "production")
    .default("development"),
  DATABASE_URL: Joi.string()
    .uri({ scheme: ["postgresql", "postgres"] })
    .when("NODE_ENV", {
      is: "production",
      then: Joi.optional(),
      otherwise: Joi.string().default(defaultDatabaseUrl),
    }),
  DATABASE_HOST: Joi.string().hostname().optional(),
  DATABASE_PORT: Joi.number().port().optional(),
  DATABASE_NAME: Joi.string().trim().min(1).max(63).optional(),
  DATABASE_USER: Joi.string().trim().min(1).max(63).optional(),
  DATABASE_PASSWORD: Joi.string().min(1).optional(),
  DATABASE_SSL: Joi.boolean().truthy("true").falsy("false").default(false),
  DATABASE_POOL_MAX: Joi.number().integer().min(1).max(100).default(4),
  DATABASE_POOL_IDLE_TIMEOUT_MS: Joi.number().integer().min(1_000).max(300_000).default(30_000),
  DATABASE_POOL_CONNECTION_TIMEOUT_MS: Joi.number().integer().min(100).max(10_000).default(2_000),
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
}).custom((value: Record<string, unknown>, helpers) => {
  if (value.NODE_ENV !== "production") return value;

  const hasUrl = typeof value.DATABASE_URL === "string";
  const presentDiscrete = databaseKeys.filter(
    (key) => value[key] !== undefined,
  );

  if (hasUrl && presentDiscrete.length > 0) {
    return helpers.message({
      custom:
        "DATABASE_URL cannot be combined with discrete DATABASE_* settings",
    });
  }
  if (!hasUrl && presentDiscrete.length !== databaseKeys.length) {
    return helpers.message({
      custom:
        "production requires DATABASE_URL or every discrete DATABASE_* setting",
    });
  }
  if (!hasUrl && value.DATABASE_SSL !== true) {
    return helpers.message({
      custom: "production discrete database configuration requires DATABASE_SSL=true",
    });
  }
  if (
    typeof value.REDIS_URL === "string" &&
    !value.REDIS_URL.startsWith("rediss://")
  ) {
    return helpers.message({
      custom: "production REDIS_URL must use rediss://",
    });
  }

  return value;
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
