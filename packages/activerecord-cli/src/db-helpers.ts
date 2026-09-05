import { join, resolve } from "path";
import { File } from "@blazetrails/ruby-compat";
import { DatabaseTasks, DatabaseConfigurations, Migrator } from "@blazetrails/activerecord";
import { establishEnvironmentConnection, normalizeSqlitePaths } from "./environment.js";

export async function loadDatabaseConfig(cwd: string): Promise<DatabaseConfigurations> {
  const configPath = resolve(join(cwd, "config", "database.ts"));
  if (!File.isExist(configPath)) {
    throw new Error(`config/database.ts not found at ${configPath}`);
  }
  const { pathToFileURL } = await import("node:url");
  const mod = await import(pathToFileURL(configPath).href);
  const raw = mod.default ?? mod;
  const configs = normalizeSqlitePaths(new DatabaseConfigurations(raw), cwd);
  DatabaseTasks.databaseConfiguration = configs;
  DatabaseTasks.root = cwd;
  Migrator.migrationsPaths = DatabaseTasks.migrationsPaths.map((p) => resolve(join(cwd, p)));
  await establishEnvironmentConnection(DatabaseTasks.env);
  return configs;
}

export async function tryLoadModels(cwd: string): Promise<Record<string, unknown>> {
  const modelsPath = resolve(join(cwd, "app", "models", "index.ts"));
  if (!File.isExist(modelsPath)) return {};
  const { pathToFileURL } = await import("node:url");
  return import(pathToFileURL(modelsPath).href) as Promise<Record<string, unknown>>;
}
