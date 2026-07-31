import { isAbsolute, resolve } from "path";
import {
  Base,
  DatabaseConfigurations,
  DatabaseTasks,
  HashConfig,
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
    return new HashConfig(config.envName, config.name, {
      ...config.configurationHash,
      database: resolve(root, database),
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
