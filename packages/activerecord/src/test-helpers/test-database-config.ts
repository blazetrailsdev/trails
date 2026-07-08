/**
 * Builds the test-environment `DatabaseConfigurations` from a Rails-faithful
 * named-connections map (the `config.yml`-analogue) selected purely by
 * `ARCONN`, and wires it into `DatabaseTasks`, routing schema load through the
 * real Rails-mirrored path (`loadSchema` / `reconstructFromSchema`).
 *
 * Mirrors `vendor/rails/activerecord/test/support/connection.rb`:
 *   - `connection_name = ENV["ARCONN"] || config["default_connection"]`
 *     (`connection.rb:10`),
 *   - `config.fetch("connections").fetch(connection_name) { ... exit 1 }`
 *     (`connection.rb:14-19`) — a hard failure when `ARCONN` names an
 *     unconfigured connection,
 *   - `unless connection_name.include?(arunit_adapter) raise ArgumentError`
 *     (`connection.rb:35-37`) — a loud raise when `ARCONN` and the resolved
 *     adapter diverge. PR #4768's `*_TEST_URL`-presence guard folds into this:
 *     a live-backend `ARCONN` whose connection details are absent resolves to
 *     SQLite, whose adapter (`sqlite3`) is not a substring of the connection
 *     name (`postgresql` / `mysql2`), so the mismatch check raises.
 *
 * As in `config.example.yml`, `ENV` only feeds connection *sub-settings*
 * (host/port/socket/credentials); it never selects the backend.
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
 * A named connection in the `connections:` hash of
 * `vendor/rails/activerecord/test/config.example.yml`: its `arunit` adapter
 * name plus a builder for the primary "test" env config.
 *
 * `build()` returns `null` when the backend's connection details are absent
 * (the live-backend analogue of a `config.yml` entry with no reachable server);
 * `resolve()` turns that into Rails' loud adapter-mismatch failure rather than
 * silently falling back to SQLite.
 */
interface NamedConnection {
  /** The `arunit` adapter name Rails checks against (`connection.rb:35`). */
  adapter: string;
  /** The public {@link TestAdapterName} lane this connection drives. */
  lane: TestAdapterName;
  build(): HashConfig | UrlConfig | null;
}

/**
 * The named connections available to the test harness, mirroring the
 * `connections:` hash of `config.example.yml`. `ARCONN` selects one of these
 * keys; `DEFAULT_CONNECTION` is Rails' `config["default_connection"]` fallback.
 *
 * Connection details for the live backends still come from `PG_TEST_URL` /
 * `MYSQL_TEST_URL` in this foundation PR; migrating those onto Rails' discrete
 * sub-setting env vars is tracked as a follow-up story.
 */
type ConnectionName = "sqlite3" | "sqlite3_mem" | "postgresql" | "mysql2";

const DEFAULT_CONNECTION: ConnectionName = "sqlite3";

const CONNECTIONS: Record<ConnectionName, NamedConnection> = {
  sqlite3: {
    adapter: "sqlite3",
    lane: "sqlite",
    build: () => new HashConfig("test", "primary", sqliteHash()),
  },
  sqlite3_mem: {
    adapter: "sqlite3",
    lane: "sqlite",
    build: () =>
      new HashConfig("test", "primary", { adapter: "sqlite3", database: ":memory:", pool: 1 }),
  },
  postgresql: {
    adapter: "postgresql",
    lane: "postgres",
    build: () => {
      const pgUrl = getEnv("PG_TEST_URL");
      return pgUrl ? new UrlConfig("test", "primary", pgUrl) : null;
    },
  },
  mysql2: {
    adapter: "mysql2",
    lane: "mysql",
    build: () => {
      const mysqlUrl = getEnv("MYSQL_TEST_URL");
      return mysqlUrl ? new UrlConfig("test", "primary", mysqlUrl) : null;
    },
  },
};

/**
 * Resolve the named connection selected by `ARCONN` into an adapter + config.
 *
 * Mirrors `ARTest.connection_name` / `test_configuration_hashes` / the
 * adapter-name guard in `connection.rb`.
 */
function resolve(): { adapter: TestAdapterName; envConfig: HashConfig | UrlConfig } {
  const connectionName = (getEnv("ARCONN") || DEFAULT_CONNECTION) as ConnectionName;
  const connection = CONNECTIONS[connectionName];
  if (!connection) {
    // Rails prints "Connection ... not found" and `exit 1`; we have no
    // `process.exit`, so the loud failure is a throw with the same message.
    // Test-helper invariant with no Rails error counterpart — a bare Error is intentional.
    // eslint-disable-next-line blazetrails/rails-error-parity
    throw new Error(
      `Connection "${connectionName}" not found. Available connections: ` +
        `${Object.keys(CONNECTIONS).join(", ")}`,
    );
  }

  const envConfig = connection.build();
  // Rails: `unless connection_name.include?(arunit_adapter) raise ArgumentError`
  // (connection.rb:35-37). A live-backend `ARCONN` whose connection details are
  // absent would silently fall back to SQLite — folding in PR #4768's guard, we
  // raise instead of resolving the wrong backend.
  if (envConfig === null) {
    // eslint-disable-next-line blazetrails/rails-error-parity
    throw new Error(
      `The connection name did not match the adapter name. Connection name is ` +
        `"${connectionName}" (adapter "${connection.adapter}"), but its connection ` +
        `details (PG_TEST_URL / MYSQL_TEST_URL) are not set, so the run would ` +
        `silently fall back to SQLite.`,
    );
  }

  return { adapter: connection.lane, envConfig };
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
 * Re-establish `Base`'s connection handler from the resolved test config if not
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
  const { envConfig } = resolve();
  if (envConfig instanceof UrlConfig) {
    await Base.establishConnection(envConfig.url);
    return;
  }
  await Base.establishConnection(envConfig.configurationHash);
}
