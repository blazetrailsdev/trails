/**
 * Builds the test-environment `DatabaseConfigurations` from the standard
 * env-var signals (`PG_TEST_URL` / `MYSQL_TEST_URL` / sqlite fallback) and
 * wires it into `DatabaseTasks`. This moves the env-sniff that lives in
 * `bootstrapTestHandler` to the `DatabaseTasks` layer so `loadSchema` and
 * `reconstructFromSchema` can use the real Rails-mirrored path.
 *
 * Phase 1 of RFC 0002 — new file, no consumer changes.
 */

import { getEnv } from "@blazetrails/activesupport";
import { DatabaseConfigurations } from "../database-configurations.js";
import { DatabaseTasks } from "../tasks/database-tasks.js";
import { HashConfig } from "../database-configurations/hash-config.js";
import { UrlConfig } from "../database-configurations/url-config.js";

export type TestAdapterName = "sqlite" | "postgres" | "mysql";

export interface TestDatabaseConfig {
  /** The `DatabaseConfigurations` instance wired into `DatabaseTasks`. */
  configs: DatabaseConfigurations;
  /** Which adapter was resolved from the environment. */
  adapter: TestAdapterName;
  /** The primary config entry for the "test" environment. */
  envConfig: HashConfig | UrlConfig;
}

function resolve(): { adapter: TestAdapterName; envConfig: HashConfig | UrlConfig } {
  const pgUrl = getEnv("PG_TEST_URL");
  if (pgUrl) {
    return { adapter: "postgres", envConfig: new UrlConfig("test", "primary", pgUrl) };
  }
  const mysqlUrl = getEnv("MYSQL_TEST_URL");
  if (mysqlUrl) {
    return { adapter: "mysql", envConfig: new UrlConfig("test", "primary", mysqlUrl) };
  }
  const database = getEnv("AR_TEST_WORKER_DB") ?? ":memory:";
  return {
    adapter: "sqlite",
    envConfig: new HashConfig("test", "primary", { adapter: "sqlite3", database, pool: 1 }),
  };
}

/**
 * Build the test `DatabaseConfigurations`, assign it to
 * `DatabaseTasks.databaseConfiguration`, and register the adapter task
 * handler. Safe to call multiple times — subsequent calls are idempotent
 * if the env vars haven't changed.
 */
export async function buildTestDatabaseConfig(): Promise<TestDatabaseConfig> {
  const { adapter, envConfig } = resolve();
  const configs = new DatabaseConfigurations([envConfig]);
  DatabaseTasks.databaseConfiguration = configs;

  switch (adapter) {
    case "sqlite": {
      const { SQLiteDatabaseTasks } = await import("../tasks/sqlite-database-tasks.js");
      SQLiteDatabaseTasks.register();
      break;
    }
    case "postgres": {
      const { PostgreSQLDatabaseTasks } = await import("../tasks/postgresql-database-tasks.js");
      PostgreSQLDatabaseTasks.register();
      break;
    }
    case "mysql": {
      const { MySQLDatabaseTasks } = await import("../tasks/mysql-database-tasks.js");
      MySQLDatabaseTasks.register();
      break;
    }
  }

  return { configs, adapter, envConfig };
}
