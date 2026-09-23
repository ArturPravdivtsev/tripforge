import Joi from "joi";

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
