import { generateManifest, MANIFEST_PATH } from "./generate-manifest.js";
import { join, resolve } from "path";
import { File } from "@blazetrails/ruby-compat";
import { getEnv, presence } from "@blazetrails/activesupport";
import { Base, DatabaseTasks, DatabaseConfigurations, Migrator } from "@blazetrails/activerecord";
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
  if (Base.configurations().empty) {
    Base.configurations(DatabaseTasks.databaseConfiguration);
  }
  DatabaseTasks.root = cwd;
  DatabaseTasks.dbDir = resolve(join(cwd, "db"));
  DatabaseTasks.migrationsPaths = [resolve(join(cwd, "db/migrate"))];
  Migrator.migrationsPaths = await DatabaseTasks.migrationsPaths;
  const env = presence(getEnv("TRAILS_ENV")) ?? presence(getEnv("NODE_ENV")) ?? "development";
  DatabaseTasks.env = env;
  await establishEnvironmentConnection(env);
  return configs;
}

export async function tryLoadModels(cwd: string): Promise<Record<string, unknown>> {
  const modelsDir = join(cwd, "app", "models");
  if (await File.isDirectoryAsync(modelsDir)) await generateManifest(modelsDir, cwd);
  const modelsPath = resolve(join(cwd, MANIFEST_PATH));
  if (!File.isExist(modelsPath)) return {};
  const { pathToFileURL } = await import("node:url");
  return import(pathToFileURL(modelsPath).href) as Promise<Record<string, unknown>>;
}
