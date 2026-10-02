import { describe, expect, it } from "vitest";

import {
  createDatabasePoolConfig,
  databaseConfigurationFromEnvironment,
} from "./database-config";

describe("database configuration", () => {
  it("preserves DATABASE_URL for local and test environments", () => {
    expect(
      createDatabasePoolConfig({
        databaseUrl: "postgresql://tripforge:tripforge@localhost:5432/tripforge",
      }),
    ).toEqual({
      connectionString:
        "postgresql://tripforge:tripforge@localhost:5432/tripforge",
    });
  });

  it("builds a TLS-enabled pool configuration from discrete RDS values", () => {
    expect(
      createDatabasePoolConfig({
        host: "database.example.internal",
        port: "5432",
        name: "tripforge",
        user: "tripforge",
        password: "secret",
        ssl: "true",
      }),
    ).toEqual({
      host: "database.example.internal",
      port: 5432,
      database: "tripforge",
      user: "tripforge",
      password: "secret",
      ssl: true,
    });
  });

  it("rejects incomplete discrete configuration", () => {
    expect(() =>
      createDatabasePoolConfig({ host: "database.example.internal" }),
    ).toThrow(/DATABASE_PORT/);
  });

  it("normalizes process environment values", () => {
    expect(
      databaseConfigurationFromEnvironment({
        DATABASE_HOST: " database.example.internal ",
        DATABASE_PORT: "5432",
        DATABASE_NAME: " tripforge ",
        DATABASE_USER: " tripforge ",
        DATABASE_PASSWORD: "secret",
        DATABASE_SSL: "true",
      }),
    ).toMatchObject({
      host: "database.example.internal",
      port: "5432",
      name: "tripforge",
      user: "tripforge",
      password: "secret",
      ssl: "true",
    });
  });
});
