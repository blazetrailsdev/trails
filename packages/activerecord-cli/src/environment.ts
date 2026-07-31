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
    const absolute = resolve(root, database);
    // Rebuild through the config's own class: a UrlConfig flattened into a
    // HashConfig would lose its `url` reader. Its constructor re-derives the
    // hash from the URL and spreads it last, so an expanded `database` in the
    // configuration would be overwritten by the URL's relative one — the URL
    // itself has to carry the expansion. That is only a safe rewrite when the
    // database is the URL's tail (`sqlite3:db/dev.sqlite3`, `db/dev.sqlite3`);
    // anything else (query parameters, say) is left alone rather than
    // rewritten by guesswork.
    if (config instanceof UrlConfig) {
      if (!config.url.endsWith(database)) return config;
      const expandedUrl = config.url.slice(0, -database.length) + absolute;
      return new UrlConfig(config.envName, config.name, expandedUrl, config.configurationHash);
    }
    return new HashConfig(config.envName, config.name, {
      ...config.configurationHash,
      database: absolute,
    });
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
