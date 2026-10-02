import type { PoolConfig } from "pg";

export interface DatabaseConfiguration {
  databaseUrl?: string;
  host?: string;
  port?: number | string;
  name?: string;
  user?: string;
  password?: string;
  ssl?: boolean | string;
}

function required(value: string | undefined, name: string): string {
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function sslEnabled(value: boolean | string | undefined): boolean {
  return value === true || value === "true";
}

export function createDatabasePoolConfig(
  configuration: DatabaseConfiguration,
): PoolConfig {
  if (configuration.databaseUrl) {
    return { connectionString: configuration.databaseUrl };
  }

  const port = Number(configuration.port);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("DATABASE_PORT must be a valid TCP port");
  }

  return {
    host: required(configuration.host, "DATABASE_HOST"),
    port,
    database: required(configuration.name, "DATABASE_NAME"),
    user: required(configuration.user, "DATABASE_USER"),
    password: required(configuration.password, "DATABASE_PASSWORD"),
    ssl: sslEnabled(configuration.ssl),
  };
}

export function databaseConfigurationFromEnvironment(
  environment: NodeJS.ProcessEnv,
): DatabaseConfiguration {
  return {
    databaseUrl: environment.DATABASE_URL?.trim(),
    host: environment.DATABASE_HOST?.trim(),
    port: environment.DATABASE_PORT,
    name: environment.DATABASE_NAME?.trim(),
    user: environment.DATABASE_USER?.trim(),
    password: environment.DATABASE_PASSWORD,
    ssl: environment.DATABASE_SSL,
  };
}
