import Joi from "joi";

const nodeEnvironments = ["development", "test", "production"] as const;
const defaultDatabaseUrl =
  "postgresql://tripforge:tripforge@127.0.0.1:5433/tripforge";

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
