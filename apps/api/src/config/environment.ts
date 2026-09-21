import Joi from "joi";

const nodeEnvironments = ["development", "test", "production"] as const;
const defaultDatabaseUrl =
  "postgresql://tripforge:tripforge@127.0.0.1:5433/tripforge";
const defaultWebOrigin = "http://127.0.0.1:3000";

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
      then: Joi.required(),
      otherwise: Joi.string().default(defaultDatabaseUrl),
    }),
  WEB_ORIGIN: webOriginSchema.when("NODE_ENV", {
    is: "production",
    then: Joi.required(),
    otherwise: webOriginSchema.default(defaultWebOrigin),
  }),
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
