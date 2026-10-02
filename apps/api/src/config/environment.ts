import Joi from "joi";

import { LOG_LEVELS } from "../observability/observability-config";

const nodeEnvironments = ["development", "test", "production"] as const;
const defaultDatabaseUrl =
  "postgresql://tripforge:tripforge@127.0.0.1:5433/tripforge";
const defaultWebOrigin = "http://127.0.0.1:3000";
const databaseKeys = [
  "DATABASE_HOST",
  "DATABASE_PORT",
  "DATABASE_NAME",
  "DATABASE_USER",
  "DATABASE_PASSWORD",
] as const;

const webOriginSchema = Joi.string()
  .uri({ scheme: ["http", "https"] })
  .custom((value: string, helpers) => {
    try {
      const url = new URL(value);

      return url.origin === value
        ? value
        : helpers.message({ custom: "WEB_ORIGIN must be an exact origin" });
    } catch {
      return helpers.message({ custom: "WEB_ORIGIN must be a valid URL" });
    }
  });

export const environmentSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid(...nodeEnvironments)
    .default("development"),
  PORT: Joi.number().port().default(4000),
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
  WEB_ORIGIN: webOriginSchema.when("NODE_ENV", {
    is: "production",
    then: Joi.required(),
    otherwise: webOriginSchema.default(defaultWebOrigin),
  }),
  REDIS_URL: Joi.string()
    .uri({ scheme: ["redis", "rediss"] })
    .when("NODE_ENV", {
      is: "production",
      then: Joi.required(),
      otherwise: Joi.string().default("redis://127.0.0.1:6379"),
    }),
  SECURITY_RATE_LIMITING_ENABLED: Joi.boolean()
    .truthy("true")
    .falsy("false")
    .when("NODE_ENV", {
      is: "production",
      then: Joi.boolean().valid(true).default(true),
      otherwise: Joi.boolean().when("NODE_ENV", {
        is: "test",
        then: Joi.boolean().default(false),
        otherwise: Joi.boolean().default(true),
      }),
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
  AI_ASSISTANT_ENABLED: Joi.boolean()
    .truthy("true")
    .falsy("false")
    .default(false),
  OPENAI_API_KEY: Joi.string().trim().empty("").min(1).optional(),
  OPENAI_MODEL: Joi.string().trim().min(1).max(100).default("gpt-6-luna"),
  OPENAI_REASONING_EFFORT: Joi.string()
    .valid("none", "low", "medium", "high", "xhigh", "max")
    .default("medium"),
  OPENAI_TIMEOUT_MS: Joi.number()
    .integer()
    .min(5_000)
    .max(120_000)
    .default(45_000),
  OPENAI_MAX_OUTPUT_TOKENS: Joi.number()
    .integer()
    .min(128)
    .max(4_000)
    .default(1_500),
  OPENROUTESERVICE_API_KEY: Joi.string().trim().empty("").min(1).optional(),
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

export function validateEnvironment(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const { error, value } = environmentSchema.validate(config, {
    abortEarly: false,
    allowUnknown: true,
  });

  if (error) {
    const details = error.details.map(({ message }) => message).join("; ");

    throw new Error(`Invalid environment configuration: ${details}`);
  }

  return value as Record<string, unknown>;
}
