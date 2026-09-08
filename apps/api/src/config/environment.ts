import Joi from "joi";

const nodeEnvironments = ["development", "test", "production"] as const;

export const environmentSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid(...nodeEnvironments)
    .default("development"),
  PORT: Joi.number().port().default(4000),
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
