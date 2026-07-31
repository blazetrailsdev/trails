import { isAbsolute, resolve } from "path";
import {
  Base,
  DatabaseConfigurations,
  DatabaseTasks,
  HashConfig,
  type DatabaseConfig,
} from "@blazetrails/activerecord";

/**
 * Rails' `db:*` tasks depend on `load_config: :environment`
 * (railties/databases.rake:22), so app boot has established
 * `ActiveRecord::Base`'s connection before any task body runs — several
 * `DatabaseTasks` methods (e.g. `migrate_all`'s single-primary fast path, and
 * `db:rollback`'s `migration_connection_pool`) lease off that ambient pool.
 * The CLI has no boot step, so this module is the one stand-in for it: every
 * command that needs an ambient pool goes through `withEnvironmentConnection`
 * or `establishEnvironmentConnection` rather than establishing its own.
 */

function isInMemory(database: string): boolean {
  return database === ":memory:" || database.startsWith("file:");
}

/**
 * Rails expands a relative SQLite path against `Rails.root` inside the adapter
 * (sqlite3_adapter.rb:49,114). trails' adapter doesn't, so boot applies the
 * same expansion against `DatabaseTasks.root` — otherwise a relative
 * `db/development.sqlite3` would open a file under the process cwd while the
 * `db:*` tasks, which already resolve against `DatabaseTasks.root`
 * (tasks/sqlite-database-tasks.ts:261-270), operate on the project one.
 *
 * Applied to the whole configurations set at load time rather than to the one
 * booted config: the tasks reach for the registry's config objects too, and
 * `establish_connection` reuses an existing pool only when handed the SAME
 * config object (connection_handler.rb:139) — a per-call copy would open a
 * second pool against a different file.
 */
export function normalizeSqlitePaths(
  configs: DatabaseConfigurations,
  root: string,
): DatabaseConfigurations {
  const normalized = configs.configurations.map((config) => {
    const database = config.database;
    if (!database || !config.adapter?.startsWith("sqlite")) return config;
    if (isInMemory(database) || isAbsolute(database)) return config;
    return new HashConfig(config.envName, config.name, {
      ...config.configurationHash,
      database: resolve(root, database),
    });
  });
  return new DatabaseConfigurations(normalized);
}

/**
 * The primary configuration the `:environment` step connects to, or null when
 * the environment has none.
 */
export function environmentDbConfig(
  env: string = DatabaseConfigurations.currentEnv(),
): DatabaseConfig | null {
  return DatabaseTasks.databaseConfiguration?.findDbConfig(env) ?? null;
}

/**
 * Establishes the environment's primary connection and leaves it open — for
 * commands (`console`, `runner`) that hand control to user code and tear the
 * connection down themselves with `Base.removeConnection()`.
 *
 * Returns the config that was connected, or null when the environment has no
 * configuration (the caller reports that).
 */
export async function establishEnvironmentConnection(
  env: string = DatabaseConfigurations.currentEnv(),
): Promise<DatabaseConfig | null> {
  const config = environmentDbConfig(env);
  if (!config) return null;
  // The config OBJECT, not its hash: that is what lets the handler recognise
  // an already-established pool, and what `withTemporaryPool` passes.
  await Base.establishConnection(config);
  return config;
}

/**
 * Runs `fn` with the environment's primary connection established, restoring
 * the prior pool afterwards. When the environment has no configuration `fn`
 * still runs — the task itself reports the missing config.
 */
export async function withEnvironmentConnection<T>(
  fn: () => Promise<T>,
  env: string = DatabaseConfigurations.currentEnv(),
): Promise<T> {
  const config = environmentDbConfig(env);
  if (!config) return fn();
  return DatabaseTasks.withTemporaryPool(config, () => fn());
}
