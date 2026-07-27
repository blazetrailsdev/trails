/**
 * The test harness' connection bootstrap, mirroring
 * `vendor/rails/activerecord/test/support/connection.rb`:
 *   - `connection_name = ENV["ARCONN"] || config["default_connection"]`
 *     (`connection.rb:10`),
 *   - `test_configuration_hashes` — `config.fetch("connections").fetch(
 *     connection_name) { ... exit 1 }` (`connection.rb:13-20`), a hard failure
 *     when `ARCONN` names an unconfigured connection,
 *   - `connect` (`connection.rb:22-38`) — assigns the configurations and
 *     establishes `Base`'s connection, including the
 *     `unless connection_name.include?(arunit_adapter) raise ArgumentError`
 *     guard (`connection.rb:35-37`) when `ARCONN` and the resolved adapter
 *     diverge.
 *
 * On top of Rails' three methods it wires the resolved configurations into
 * `DatabaseTasks`, so schema load runs through the real Rails-mirrored path
 * (`loadSchema` / `reconstructFromSchema`). Rails has no equivalent because its
 * suite loads `schema.rb` directly from `cases/helper.rb`.
 *
 * As in `config.example.yml`, `ENV` only feeds connection *sub-settings*
 * (host/port/socket/credentials, via `config.ts`); it never
 * selects the backend.
 */

import { getEnv, getOsAsync } from "@blazetrails/activesupport";
import { getPathAsync } from "@blazetrails/activesupport/fs-adapter";
import { ArgumentError } from "@blazetrails/activemodel";
import { Base } from "../base.js";
import { DatabaseConfigurations } from "../database-configurations.js";
import { DatabaseTasks } from "../tasks/database-tasks.js";
import { HashConfig } from "../database-configurations/hash-config.js";
import { UrlConfig } from "../database-configurations/url-config.js";
import { arunitDatabaseNames } from "./arunit2-config.js";
import {
  CONNECTION_LANES,
  DEFAULT_CONNECTION,
  driverConfig,
  mysqlSettings,
  postgresSettings,
  type ConnectionName,
  type EnvReader,
  type ServerSettings,
  type TestAdapterName,
} from "./config.js";

export type { TestAdapterName };

/**
 * The connection name selected by `ARCONN`, falling back to
 * `config["default_connection"]`. Mirrors `connection.rb:9-11`.
 *
 * `??`, not an empty-string check: Ruby's `ENV["ARCONN"] || ...` falls back on
 * nil alone, so `ARCONN=""` selects the connection named `""` and fails in
 * {@link testConfigurationHashes} with `Connection "" not found` rather than
 * quietly running sqlite. Sub-settings do treat `""` as absent (`config.ts`);
 * the selector must not.
 *
 * Returns a bare `string`, not a `ConnectionName`: `ARCONN` is arbitrary user
 * input, and asserting it into the union here would be a type lie that makes
 * the unknown-name branch look unreachable to every caller.
 * {@link testConfigurationHashes} owns Rails' "Connection not found" failure,
 * so the error surfaces once, at config-build time.
 */
export function connectionName(read: EnvReader = getEnv): string {
  return read("ARCONN") ?? DEFAULT_CONNECTION;
}

/**
 * The backend lane the current `ARCONN` drives. Unknown names resolve to the
 * default connection's lane; the loud failure for those belongs to
 * {@link testConfigurationHashes}, not to every lane predicate in the harness.
 *
 * `activeLane` keeps its trails name: Rails has no counterpart, because Ruby
 * dispatches on the live adapter object and never needs a coarse
 * sqlite/postgres/mysql bucket to gate helpers on.
 */
export function activeLane(read: EnvReader = getEnv): TestAdapterName {
  const lanes: Partial<Record<string, TestAdapterName>> = CONNECTION_LANES;
  return lanes[connectionName(read)] ?? CONNECTION_LANES[DEFAULT_CONNECTION];
}

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
 * `testConfigurationHashes()` turns that into Rails' loud adapter-mismatch failure rather than
 * silently falling back to SQLite.
 */
interface NamedConnection {
  /** The `arunit` adapter name Rails checks against (`connection.rb:35`). */
  adapter: string;
  /** The public {@link TestAdapterName} lane this connection drives. */
  lane: TestAdapterName;
  /** The `arunit` hash; `expandConfig` derives the other named entries from it. */
  build(): Promise<Record<string, unknown>>;
}

/**
 * Turn {@link ServerSettings} into the `configuration_hash` a `HashConfig`
 * carries. Rails' `config.example.yml` entries are exactly this: an adapter
 * plus discrete host/port/socket/credential keys — never a URL. The key
 * translation (and why it emits two spellings of the credential and socket)
 * lives in `driverConfig`.
 */
function serverHash(adapter: string, settings: ServerSettings): Record<string, unknown> {
  return { adapter, ...driverConfig(settings) };
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
    build: async () => await sqliteHash(),
  },
  sqlite3_mem: {
    adapter: "sqlite3",
    lane: "sqlite",
    build: async () => ({ adapter: "sqlite3", database: ":memory:", pool: 1 }),
  },
  postgresql: {
    adapter: "postgresql",
    lane: "postgres",
    build: async () => serverHash("postgresql", postgresSettings()),
  },
  mysql2: {
    adapter: "mysql2",
    lane: "mysql",
    build: async () => serverHash("mysql2", mysqlSettings()),
  },
};

/**
 * The connection-hash keys of the `ARCONN`-selected entry that are known
 * without doing async work — the pre-connection stand-in for
 * `ActiveRecord::Base.connection_pool.db_config.configuration_hash`. The
 * sqlite3 entry's `database` is resolved asynchronously
 * ({@link fallbackDatabasePath}) and is therefore absent here.
 */
export function configuredConnectionHash(): Record<string, unknown> {
  switch (connectionName()) {
    case "sqlite3_mem":
      return { adapter: "sqlite3", database: ":memory:", pool: 1 };
    case "sqlite3":
      return { adapter: "sqlite3", timeout: 5000, strict: true };
    case "postgresql":
      return serverHash("postgresql", postgresSettings());
    case "mysql2":
      return serverHash("mysql2", mysqlSettings());
    default:
      return {};
  }
}

/**
 * The three named entries every connection carries, mirroring `expand_config`
 * (`config.rb:26-37`): `arunit`, `arunit2` and
 * `arunit_without_prepared_statements`. Rails spells them as keys of the
 * connection's hash, and because `Base.configurations` treats top-level keys as
 * environments, `establish_connection :arunit` resolves one by name — which is
 * why they are the `envName` here, with Rails' `primary` spec name.
 *
 * Rails defaults the databases to `activerecord_unittest` /
 * `activerecord_unittest2` / `activerecord_unittest`; trails takes them from
 * the sub-settings instead, so `arunit` is the worker database the canonical
 * schema is loaded into and `arunit2` the derived second database
 * (`arunitDatabaseNames`). `arunit_without_prepared_statements` shares
 * `arunit`'s database and only turns prepared statements off, as in
 * `config.example.yml:74-79`.
 */
function expandConfig(arunit: Record<string, unknown>): HashConfig[] {
  const database = String(arunit.database ?? "");
  const arunit2 = database === ":memory:" ? database : arunitDatabaseNames(database).arunit2;

  return [
    new HashConfig("arunit", "primary", arunit),
    new HashConfig("arunit2", "primary", { ...arunit, database: arunit2 }),
    new HashConfig("arunit_without_prepared_statements", "primary", {
      ...arunit,
      preparedStatements: false,
    }),
  ];
}

/**
 * The configuration hashes for the connection `ARCONN` selects, mirroring
 * `ARTest.test_configuration_hashes` (`connection.rb:13-20`) plus the
 * adapter-name guard `connect` applies (`connection.rb:35-37`).
 *
 * Rails returns the raw hash and lets `connect` derive the adapter from the
 * established pool; trails builds the config object here, so the resolved lane
 * comes back alongside it rather than being re-read from a live connection.
 *
 */
export async function testConfigurationHashes(): Promise<{
  adapter: TestAdapterName;
  /** The `arunit` entry — the one `connect` establishes as the primary pool. */
  envConfig: HashConfig;
  /** All three named entries, as `ARTest.test_configuration_hashes` returns them. */
  configurationHashes: HashConfig[];
}> {
  const name = connectionName();
  // `name` is arbitrary user input from ARCONN, so the lookup is a partial one;
  // the miss below is Rails' "Connection not found" exit (connection.rb:14-19).
  const connections: Partial<Record<string, NamedConnection>> = CONNECTIONS;
  const connection = connections[name];
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

  const configurationHashes = expandConfig(await connection.build());
  const envConfig = configurationHashes[0];
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

  return { adapter: connection.lane, envConfig, configurationHashes };
}

async function fallbackDatabasePath(): Promise<string> {
  const g = globalThis as typeof globalThis & { __arFallbackDbPath?: string };
  if (g.__arFallbackDbPath) return g.__arFallbackDbPath;
  const path = await getPathAsync();
  const os = await getOsAsync();
  const runToken =
    getEnv("AR_TEST_RUN_TOKEN") ||
    `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const slot = getEnv("VITEST_POOL_ID") || getEnv("VITEST_WORKER_ID") || "1";
  const token = `${runToken}-${slot}`;
  const dbPath = path.join(os.tmpdir(), `ar-test-fallback-${token}.sqlite`);
  // Imported lazily: `sqlite-template.ts` imports `activeLane` from this
  // module, and a static import here would close that cycle at module-init time.
  const { registerDbFileCleanupOnExit } = await import("./sqlite-template.js");
  await registerDbFileCleanupOnExit(dbPath);
  g.__arFallbackDbPath = dbPath;
  return dbPath;
}

async function sqliteHash(): Promise<Record<string, unknown>> {
  const workerDb = getEnv("AR_TEST_WORKER_DB");
  return {
    adapter: "sqlite3",
    database: workerDb || (await fallbackDatabasePath()),
    timeout: 5000,
    strict: true,
  };
}

/**
 * Assign the test `DatabaseConfigurations` and establish `Base`'s connection,
 * mirroring `ARTest.connect` (`connection.rb:22-38`).
 *
 * `Base.configurations` is assigned as Rails does (`connection.rb:31`) — all
 * three named entries — and the primary pool is established by name
 * (`establish_connection :arunit`, `connection.rb:32`), so ARTest-style lookups
 * such as `Base.establishConnection("arunit")` resolve against the same test
 * configuration the pool was opened from.
 *
 * Beyond Rails it registers the adapter's `DatabaseTasks` handler, because
 * trails loads the schema through `DatabaseTasks` rather than by evaluating
 * `schema.rb` in-process. The registration runs on every call so callers that
 * clear `_registeredTasks` (e.g. `database-tasks.test.ts`) can re-register.
 *
 * Rails also establishes `ARUnit2Model` on `:arunit2` here; trails does that
 * from `setupSecondPool` instead, since only the sqlite lane provisions a
 * second database today (see `arunit2-config.ts`).
 */
export async function connect(): Promise<TestDatabaseConfig> {
  const { adapter, envConfig, configurationHashes } = await testConfigurationHashes();
  const configs = new DatabaseConfigurations(configurationHashes);
  Base.configurations(configs);
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

  // `connection.rb:32` — established by name, not from the raw hash, so the
  // pool comes from the same `arunit` entry `Base.configurations` publishes.
  await Base.establishConnection("arunit");

  return { configs, adapter, envConfig };
}

/**
 * Re-establish `Base`'s connection handler from the resolved test config if not
 * already connected. Called by `setupHandlerSuite` so handler-path test files
 * get a live pool without knowing which adapter the worker is using.
 * Idempotent — a no-op when already connected.
 *
 * `establishFromTestConfig` keeps its trails name: Rails has no counterpart,
 * because its suite connects once from `cases/helper.rb` and never needs an
 * idempotent re-establish for individual files.
 *
 * Intentionally does NOT call `connect` — that would set
 * `DatabaseTasks.databaseConfiguration`, contaminating tests in
 * `database-tasks.test.ts` that rely on it being null. This function only
 * re-establishes `Base`'s connection; `DatabaseTasks` state is left as-is.
 */
export async function establishFromTestConfig(): Promise<void> {
  if (Base.isConnectedQ()) return;
  const { envConfig } = await testConfigurationHashes();
  if (envConfig instanceof UrlConfig) {
    await Base.establishConnection(envConfig.url);
    return;
  }
  await Base.establishConnection(envConfig.configurationHash);
}
