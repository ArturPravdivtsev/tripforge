import type { PoolConfig } from "pg";

export interface DatabaseConfiguration {
  databaseUrl?: string;
  host?: string;
  port?: number | string;
  name?: string;
  user?: string;
  password?: string;
  ssl?: boolean | string;
  poolMax?: number | string;
  idleTimeoutMs?: number | string;
  connectionTimeoutMs?: number | string;
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
  const pool = {
    max: positiveInteger(configuration.poolMax, 10, "DATABASE_POOL_MAX"),
    idleTimeoutMillis: positiveInteger(configuration.idleTimeoutMs, 30_000, "DATABASE_POOL_IDLE_TIMEOUT_MS"),
    connectionTimeoutMillis: positiveInteger(configuration.connectionTimeoutMs, 2_000, "DATABASE_POOL_CONNECTION_TIMEOUT_MS"),
  };
  if (configuration.databaseUrl) {
    return { ...pool, connectionString: configuration.databaseUrl };
  }

  const port = Number(configuration.port);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("DATABASE_PORT must be a valid TCP port");
  }

  return {
    ...pool,
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
    poolMax: environment.DATABASE_POOL_MAX,
    idleTimeoutMs: environment.DATABASE_POOL_IDLE_TIMEOUT_MS,
    connectionTimeoutMs: environment.DATABASE_POOL_CONNECTION_TIMEOUT_MS,
  };
}

function positiveInteger(value: number | string | undefined, fallback: number, name: string): number {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${name} must be a positive integer`);
  return parsed;
}
