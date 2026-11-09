import { isAbsolute, resolve } from "path";
import {
  Base,
  DatabaseConfigurations,
  DatabaseTasks,
  HashConfig,
  UrlConfig,
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
    if (config instanceof UrlConfig) {
      if (!config.url.endsWith(database)) return config;
      const prefix = config.url.slice(0, -database.length);
      const expandedUrl = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(prefix)
        ? prefix + absolute
        : `${config.adapter}:${prefix}${absolute}`;
      return new UrlConfig(config.envName, config.name, expandedUrl, config.configurationHash);
    }
    return new HashConfig(config.envName, config.name, {
      ...config.configurationHash,
      database: absolute,
    });
  });
  return new DatabaseConfigurations(normalized);
}

export function environmentDbConfig(env: string): HashConfig | null {
  return DatabaseTasks.databaseConfiguration?.findDbConfig(env) ?? null;
}

export async function establishEnvironmentConnection(env: string): Promise<HashConfig | null> {
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
