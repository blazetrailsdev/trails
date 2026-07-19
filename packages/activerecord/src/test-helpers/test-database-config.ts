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
 *     adapter diverge.
 *
 * As in `config.example.yml`, `ENV` only feeds connection *sub-settings*
 * (host/port/socket/credentials, via `test-connection-env.ts`); it never
 * selects the backend.
 *
 * Phase 1 of RFC 0002 — new file, no consumer changes.
 * Phase 2 of RFC 0002 — adds `establishFromTestConfig` for setupHandlerSuite.
 * Phase 4 of RFC 0002 — sole env-sniff source after bootstrap-test-handler deleted.
 */

import { getEnv } from "@blazetrails/activesupport";
import { ArgumentError } from "@blazetrails/activemodel";
import { Base } from "../base.js";
import { DatabaseConfigurations } from "../database-configurations.js";
import { DatabaseTasks } from "../tasks/database-tasks.js";
import { HashConfig } from "../database-configurations/hash-config.js";
import { UrlConfig } from "../database-configurations/url-config.js";
import {
  connectionName,
  mysqlSettings,
  postgresSettings,
  type ConnectionName,
  type ServerSettings,
  type TestAdapterName,
} from "./test-connection-env.js";

export type { TestAdapterName };

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
  build(): HashConfig;
}

/**
 * Turn {@link ServerSettings} into the `configuration_hash` shape a
 * `HashConfig` carries. Rails' `config.example.yml` entries are exactly this:
 * an adapter plus discrete host/port/socket/credential keys — never a URL.
 *
 * The credential is emitted under BOTH `username` and `user`, because the two
 * layers that read it disagree — a divergence this config has to straddle, not
 * create:
 *
 *   - `MySQLDatabaseTasks#buildAdapterConfig` / `PostgreSQLDatabaseTasks` read
 *     Rails' canonical `username` (as `database.yml` spells it).
 *   - `Mysql2Adapter` / `PostgreSQLAdapter` hand the residual config straight to
 *     the `mysql2` / `pg` drivers, which read the driver-native `user`.
 *
 * The previous `UrlConfig` satisfied both by accident: each layer parsed the
 * credential out of the URL itself. Emitting only one key silently connects as
 * the OS user instead of failing — both drivers ignore the key they don't know
 * (verified against a live server). Converging the adapters onto Rails'
 * `username` alias would let this drop back to one key; that is its own story.
 *
 * `socket` and `password` are omitted when unset so the drivers apply their
 * own defaults (a literal `undefined` is not the same as absent to mysql2).
 */
function serverHash(adapter: string, settings: ServerSettings): Record<string, unknown> {
  const { host, port, user, password, database, socket } = settings;
  return {
    adapter,
    host,
    port,
    username: user,
    user,
    database,
    ...(password === undefined ? {} : { password }),
    ...(socket === undefined ? {} : { socket }),
  };
}

/**
 * The named connections available to the test harness, mirroring the
 * `connections:` hash of `config.example.yml`. `ARCONN` selects one of these
 * keys; `DEFAULT_CONNECTION` is Rails' `config["default_connection"]` fallback.
 *
 * Every entry builds a `HashConfig` from discrete sub-settings, matching how
 * Rails' yml interpolates `MYSQL_HOST`/`MYSQL_PORT`/`MYSQL_SOCK` and defers to
 * libpq's `PG*` vars. No entry reads a connection URL.
 */
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
    build: () => new HashConfig("test", "primary", serverHash("postgresql", postgresSettings())),
  },
  mysql2: {
    adapter: "mysql2",
    lane: "mysql",
    build: () => new HashConfig("test", "primary", serverHash("mysql2", mysqlSettings())),
  },
};

/**
 * Resolve the named connection selected by `ARCONN` into an adapter + config.
 *
 * Mirrors `ARTest.connection_name` / `test_configuration_hashes` / the
 * adapter-name guard in `connection.rb`.
 */
function resolve(): { adapter: TestAdapterName; envConfig: HashConfig | UrlConfig } {
  const name = connectionName();
  const connection = CONNECTIONS[name];
  if (!connection) {
    // Rails prints "Connection ... not found" and `exit 1`; we have no
    // `process.exit`, so the loud failure is a throw with the same message.
    // Test-helper invariant with no Rails error counterpart — a bare Error is intentional.
    // eslint-disable-next-line blazetrails/rails-error-parity
    throw new Error(
      `Connection "${name}" not found. Available connections: ` +
        `${Object.keys(CONNECTIONS).join(", ")}`,
    );
  }

  const envConfig = connection.build();
  // Rails: `unless connection_name.include?(arunit_adapter) raise ArgumentError`
  // (connection.rb:35-37). Previously this fired on a missing `*_TEST_URL` — an
  // env-presence proxy, since absent connection details silently resolved to
  // SQLite. Sub-settings always carry defaults, so there is no "absent" state
  // left to proxy for; the check is now Rails' literal one, comparing the
  // connection name against the adapter its entry actually built. That makes it
  // a structural invariant over the CONNECTIONS table (a mislabelled entry
  // raises) rather than a report on the environment.
  const builtAdapter = String(envConfig.configurationHash.adapter);
  if (!name.includes(builtAdapter)) {
    throw new ArgumentError(
      `The connection name did not match the adapter name. Connection name is ` +
        `'${name}' and the adapter name is '${builtAdapter}'.`,
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
