/**
 * Builds the test-environment `DatabaseConfigurations` from the standard
 * env-var signals (`PG_TEST_URL` / `MYSQL_TEST_URL` / sqlite fallback) and
 * wires it into `DatabaseTasks`, routing schema load through the real
 * Rails-mirrored path (`loadSchema` / `reconstructFromSchema`).
 *
 * Phase 1 of RFC 0002 — new file, no consumer changes.
 * Phase 2 of RFC 0002 — adds `establishFromTestConfig` for setupHandlerSuite.
 * Phase 4 of RFC 0002 — sole env-sniff source after bootstrap-test-handler deleted.
 */

import { getEnv } from "@blazetrails/activesupport";
import { Base } from "../base.js";
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

/**
 * Guard against a silent SQLite fallback when `ARCONN` selects a live backend.
 *
 * `ARCONN` only drives which tests vitest includes (`vitest.config.ts`); the
 * backend is chosen here from `PG_TEST_URL` / `MYSQL_TEST_URL`. When `ARCONN`
 * is `postgresql`/`mysql2` but the matching `*_TEST_URL` is absent, the SELECTs
 * would run against SQLite while the run pretends to be the PG/MySQL job — a
 * false green that hides adapter-specific divergences. Fail loudly instead.
 */
function assertTestUrlPresentForArconn(pgUrl?: string, mysqlUrl?: string): void {
  const arconn = getEnv("ARCONN");
  if (arconn === "postgresql" && !pgUrl) {
    // Test-helper invariant with no Rails error counterpart — a bare Error is intentional.
    // eslint-disable-next-line blazetrails/rails-error-parity
    throw new Error(
      "ARCONN=postgresql but PG_TEST_URL is not set: the test backend would " +
        "silently fall back to SQLite, running against the wrong database. " +
        "Set PG_TEST_URL to a live PostgreSQL, or unset ARCONN to run on SQLite.",
    );
  }
  if (arconn === "mysql2" && !mysqlUrl) {
    // Test-helper invariant with no Rails error counterpart — a bare Error is intentional.
    // eslint-disable-next-line blazetrails/rails-error-parity
    throw new Error(
      "ARCONN=mysql2 but MYSQL_TEST_URL is not set: the test backend would " +
        "silently fall back to SQLite, running against the wrong database. " +
        "Set MYSQL_TEST_URL to a live MySQL, or unset ARCONN to run on SQLite.",
    );
  }
}

function resolve(): { adapter: TestAdapterName; envConfig: HashConfig | UrlConfig } {
  const pgUrl = getEnv("PG_TEST_URL");
  const mysqlUrl = getEnv("MYSQL_TEST_URL");
  assertTestUrlPresentForArconn(pgUrl, mysqlUrl);
  if (pgUrl) {
    return { adapter: "postgres", envConfig: new UrlConfig("test", "primary", pgUrl) };
  }
  if (mysqlUrl) {
    return { adapter: "mysql", envConfig: new UrlConfig("test", "primary", mysqlUrl) };
  }
  return {
    adapter: "sqlite",
    envConfig: new HashConfig("test", "primary", sqliteHash()),
  };
}

/**
 * Build the sqlite primary config hash. Mirrors Rails' primary test config,
 * which leaves `pool` unset so `HashConfig#pool` defaults to 5
 * (`hash_config.rb:72`). We only pin `pool: 1` on a bare `:memory:` primary
 * (no `AR_TEST_WORKER_DB`): better-sqlite3 gives separate connections separate
 * empty `:memory:` DBs (Rails' `in_memory_db?`). The file-backed per-worker
 * clone lane shares the file across connections, so it inherits Rails' 5.
 */
function sqliteHash(): { adapter: string; database: string; pool?: number } {
  const workerDb = getEnv("AR_TEST_WORKER_DB");
  if (workerDb) {
    return { adapter: "sqlite3", database: workerDb };
  }
  return { adapter: "sqlite3", database: ":memory:", pool: 1 };
}

/**
 * Build the test `DatabaseConfigurations`, assign it to
 * `DatabaseTasks.databaseConfiguration`, and register the adapter task
 * handler. Called once from `test-setup-dy.ts` during worker startup;
 * the registration runs on every call so callers that clear
 * `_registeredTasks` (e.g. `database-tasks.test.ts`) can re-register.
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

/**
 * Re-establish `Base`'s connection handler from the env-var config if not
 * already connected. Called by `setupHandlerSuite` so handler-path test files
 * get a live pool without knowing which adapter the worker is using.
 * Idempotent — a no-op when already connected.
 *
 * Intentionally does NOT call `buildTestDatabaseConfig` — that would set
 * `DatabaseTasks.databaseConfiguration`, contaminating tests in
 * `database-tasks.test.ts` that rely on it being null. This function only
 * re-establishes `Base`'s connection; `DatabaseTasks` state is left as-is.
 */
export async function establishFromTestConfig(): Promise<void> {
  if (Base.isConnectedQ()) return;
  const pgUrl = getEnv("PG_TEST_URL");
  const mysqlUrl = getEnv("MYSQL_TEST_URL");
  assertTestUrlPresentForArconn(pgUrl, mysqlUrl);
  if (pgUrl) {
    await Base.establishConnection(pgUrl);
    return;
  }
  if (mysqlUrl) {
    await Base.establishConnection(mysqlUrl);
    return;
  }
  await Base.establishConnection(sqliteHash());
}
