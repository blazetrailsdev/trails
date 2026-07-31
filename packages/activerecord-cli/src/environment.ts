import { isAbsolute, resolve } from "path";
import {
  Base,
  DatabaseConfigurations,
  DatabaseTasks,
  HashConfig,
  UrlConfig,
  type DatabaseConfig,
} from "@blazetrails/activerecord";

function isMemoryOrUri(database: string): boolean {
  return database === ":memory:" || database.startsWith("file:");
}

export function normalizeSqlitePaths(
  configs: DatabaseConfigurations,
  root: string,
): DatabaseConfigurations {
  const normalized = configs.configurations.map((config) => {
    const database = config.database;
    if (!database || !config.adapter?.startsWith("sqlite")) return config;
    if (isMemoryOrUri(database) || isAbsolute(database)) return config;
    const expanded = { ...config.configurationHash, database: resolve(root, database) };
    // Rebuild through the config's own class: a UrlConfig flattened into a
    // HashConfig would lose its `url` reader. UrlConfig re-derives the hash
    // from the URL and so wins over `expanded.database` for scheme-style
    // URLs (`sqlite3://...`) — those already parse to an absolute path and
    // are filtered out above, so the expansion is never silently dropped.
    if (config instanceof UrlConfig) {
      return new UrlConfig(config.envName, config.name, config.url, expanded);
    }
    return new HashConfig(config.envName, config.name, expanded);
  });
  return new DatabaseConfigurations(normalized);
}

export function environmentDbConfig(env: string): DatabaseConfig | null {
  return DatabaseTasks.databaseConfiguration?.findDbConfig(env) ?? null;
}

export async function establishEnvironmentConnection(env: string): Promise<DatabaseConfig | null> {
  const config = environmentDbConfig(env);
  if (!config) return null;
  await Base.establishConnection(config);
  return config;
}

export async function withEnvironmentConnection<T>(fn: () => Promise<T>, env: string): Promise<T> {
  const config = environmentDbConfig(env);
  if (!config) return fn();
  return DatabaseTasks.withTemporaryPool(config, () => fn());
}
